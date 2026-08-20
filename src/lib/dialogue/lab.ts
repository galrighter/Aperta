import type { LlmUsage } from "@/lib/llm/core";
import { SPEC_FIELDS, ratioOf, sourceOf, type EditSpec, type FieldSource } from "./spec";

// dialogue mode — רתמת המדידה של שלב A (‏A0 ב-docs/DIALOGUE_PLAN.md §7).
//
// **מה נמדד, ומה לא.** המטריקה שקובעת היא **כמה סבבים עד "זה מה שביקשתי"
// ועלות מצטברת עד שם** — לא איכות סבב בודד (§7.1). זו אינה קפדנות
// מתודולוגית אלא המסקנה של §2.4: תמונת הייחוס היא 323 טוקנים מתוך ~1,576,
// ולכן כל חיסכון לסבב הוא רעש. לקוחה שמרוצה בסבב 2 במקום בסבב 5 חוסכת שלוש
// קריאות תמונה ושלוש המתנות — וזה כל התקציב.
//
// **שני צירים נפרדים בשלב הטקסט** (§5.3), כי מודל יכול להיות טוב באחד וגרוע
// בשני:
//
//  1. **הבנת עברית** — האם הכוונה שנקלטה היא הכוונה. זה **שיפוט אנושי**, ואין
//     כאן ניסיון לחקות אותו: מה שהמודול נותן הוא סדר עיוור (`blindOrder`)
//     שמונע מהמדרג לדעת איזה מסלול הוא מדרג, ואיסוף של מה שדורג.
//  2. **תיאור גרפי** — האם ה-`image_instruction` מפרט צללית, מבנה, שטח שלילי
//     וקצב, או חוזר על העברית באנגלית. החלק הזה **כן** נמדד אוטומטית
//     (`gradeInstruction`), ובכוונה: הוא מכני, הוא חוזר על עצמו על עשר
//     בקשות בשני מסלולים, ומדרג אנושי שעושה אותו ביד מתעייף ומתחיל לאשר.
//
// **מה שהמודול הזה לא עושה: לא ממציא מחירים.** ‏§5.1 מציין במפורש שמחיר
// המכהן לא אומת, וטבלת המחירים כאן נושאת רק מה שנמדד או פורסם — כל השאר
// מחזיר `null`, והדוח מציג טוקנים. מספר מומצא בדוח השוואה הוא בדיוק הדבר
// שיכריע החלטה לכיוון הלא נכון.

/* ===== ציר 2: איכות התיאור הגרפי ===== */

/**
 * ארבעת הצירים שהוראת הציור אמורה לפרט (§7.1), וה-אוצר מילים שמעיד על כל
 * אחד. **מילים גיאומטריות בלבד** — זו כל הבחינה: הוראה שכתובה ברגש ("calmer",
 * "more elegant") אינה מכסה שום ציר, גם אם היא ארוכה.
 *
 * הרשימות מכוונות לרוחב ולא לדיוק: מה שנמדד הוא **האם המודל דיבר על הציר
 * הזה בכלל**, לא כמה טוב. מדד רופף שחוזר על 20 הרצות שווה יותר ממדד מדויק
 * שדורש קריאה של בן־אדם בכל אחת מהן.
 */
const AXIS_WORDS = {
  silhouette: [
    "silhouette", "contour", "outline", "outer edge", "outer contour", "profile",
    "perimeter", "taper", "tapers", "tapering", "scallop", "curve", "curved",
    "edge", "edges", "waist", "waisted", "asymmetric outline", "flare", "flares",
  ],
  structure: [
    "band", "bands", "spine", "strut", "struts", "arm", "arms", "connected",
    "connects", "connecting", "web", "mass", "metal", "thickness", "thick",
    "thin", "thinner", "wider", "narrow", "narrower", "solid", "bridge", "bridges",
  ],
  negativeSpace: [
    "opening", "openings", "cut", "cuts", "cut-out", "cutout", "cutouts", "slot",
    "slots", "aperture", "apertures", "void", "voids", "gap", "gaps", "negative space",
    "hole", "holes", "pierce", "pierced", "window", "windows", "empty",
  ],
  rhythm: [
    "rhythm", "spacing", "spaced", "evenly", "repeat", "repeats", "repetition",
    "interval", "intervals", "symmetry", "symmetric", "symmetrical", "asymmetry",
    "asymmetric", "alternating", "alternate", "density", "denser", "sparser",
    "graduated", "progression", "mirrored", "balance", "balanced",
  ],
} as const;

export type InstructionAxis = keyof typeof AXIS_WORDS;

export const INSTRUCTION_AXES = Object.keys(AXIS_WORDS) as InstructionAxis[];

export interface InstructionGrade {
  /**
   * ההוראה מכילה עברית — **פסילה, לא ניקוד**.
   *
   * הפרומפט דורש אנגלית מפורשות, ומודל התמונה מקבל את המחרוזת הזו כהוראת
   * ציור. עברית שנשארה בה פירושה שהשלב לא עשה את עבודתו: הוא העביר הלאה את
   * הקלט במקום לתרגם אותו — כלומר בדיוק המסלול של היום, בעלות של שלב נוסף.
   */
  hebrew: boolean;
  /** אילו מארבעת הצירים ההוראה נוגעת בהם. */
  axes: Record<InstructionAxis, boolean>;
  /** כמה מהם, ‏0–4. **זה הציון** של ציר התיאור הגרפי. */
  covered: number;
  /** אורך ההוראה במילים. לא ציון — הקשר: כיסוי 4 ב-12 מילים וכיסוי 4 ב-90
   *  אינם אותו דבר, ובלי המספר הזה אי אפשר לראות מודל שמכסה בפטפוט. */
  words: number;
  /**
   * ההוראה נראית כתרגום ישיר של הבקשה ולא כהוראה — קצרה מדי מכדי לשאת
   * גיאומטריה, או שאינה נוגעת באף ציר.
   *
   * הסף הוא 8 מילים: "reduce the openings on the right side" הוא שבע, והוא
   * בדיוק המקרה שמדובר בו — הבקשה של הלקוחה, באנגלית.
   */
  echo: boolean;
}

const HEBREW = /[֐-׿]/;
const ECHO_MAX_WORDS = 8;

/** הציון האוטומטי של הוראת הציור. ראה `InstructionGrade`. */
export function gradeInstruction(text: string | null | undefined): InstructionGrade {
  const raw = (text ?? "").trim();
  const lower = raw.toLowerCase();
  const words = raw ? raw.split(/\s+/).length : 0;
  const axes = {} as Record<InstructionAxis, boolean>;
  for (const axis of INSTRUCTION_AXES) {
    // גבול מילה משני הצדדים: `"cut"` אינו אמור להידלק על `"circuit"`, אבל
    // ביטוי דו-מילי (`"negative space"`) חייב להיתפס כמו שהוא.
    axes[axis] = AXIS_WORDS[axis].some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(lower));
  }
  const covered = INSTRUCTION_AXES.filter((a) => axes[a]).length;
  return {
    hebrew: HEBREW.test(raw),
    axes,
    covered,
    words,
    echo: words > 0 && (words <= ECHO_MAX_WORDS || covered === 0),
  };
}

/* ===== כיסוי הסגירה (‏PROMPT_SPEC §7) ===== */

/**
 * כמה מדרגות החופש של §2 המפרט הכריע — ובאיזה מקור.
 *
 * זו העמודה השנייה בטבלת A0 של ‏PROMPT_SPEC §7 ("כיסוי הסגירה"), והיא
 * אוטומטית מה-JSON בכוונה: היא רצה על כל סבב, בלי דירוג אנושי. המניין הוא
 * על שדות הטקסט + היחס; `sources` אינו נספר — הוא מטא-נתון, לא הכרעה.
 *
 * ‏`bySource` נספר רק על שדות **שנכתבו**: שדה חסר אינו "inferred חסר" אלא
 * דרגת חופש פתוחה, וזו בדיוק ההבחנה שהמדד קיים בשבילה (§1.1 — ציר פתוח
 * הוא קובייה).
 */
export interface ClosureCoverage {
  /** כמה דרגות חופש יש בסכמה בכלל — שדות הטקסט + היחס. */
  total: number;
  /** כמה מהן הוכרעו במפרט הזה. */
  decided: number;
  bySource: Record<FieldSource, number>;
}

export function closureCoverage(spec: EditSpec | null | undefined): ClosureCoverage {
  const bySource: Record<FieldSource, number> = { user: 0, inferred: 0, chosen: 0 };
  let decided = 0;
  for (const [key] of SPEC_FIELDS) {
    if (spec?.[key]?.trim()) {
      decided += 1;
      bySource[sourceOf(spec, key)] += 1;
    }
  }
  if (ratioOf(spec) !== null) {
    decided += 1;
    bySource[sourceOf(spec, "length_to_width_ratio")] += 1;
  }
  return { total: SPEC_FIELDS.length + 1, decided, bySource };
}

/* ===== אחידות ורצפת הרעש (‏PROMPT_SPEC §1.4, §7) ===== */

/**
 * פיזור של מדידה חוזרת — אותו פרומפט N פעמים, על מה שהצינור ממילא מודד:
 * ‏`drawnRatio`, מניין פתחים, שיעור מסירת פאנלים.
 *
 * ‏`cv` (סטיית תקן ÷ ממוצע) ולא סטיית התקן לבדה, כי המדדים חיים בסקאלות
 * שונות — פיזור של 0.5 הוא ענק במניין פתחים וזניח ביחס 16 — וההשוואה מול
 * הרצפה חייבת מספר חסר-יחידות. `null` כשאין ממה לחשב: פחות משתי מדידות,
 * או ממוצע אפס.
 */
export interface Dispersion {
  n: number;
  mean: number | null;
  /** סטיית תקן מדגמית (n−1). */
  sd: number | null;
  /** ‏sd ÷ |mean| — מקדם ההשתנות. `null` גם כשהממוצע אפס. */
  cv: number | null;
}

export function dispersion(values: Array<number | null | undefined>): Dispersion {
  const real = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const n = real.length;
  if (!n) return { n: 0, mean: null, sd: null, cv: null };
  const mean = real.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, sd: null, cv: null };
  const sd = Math.sqrt(real.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, cv: mean === 0 ? null : sd / Math.abs(mean) };
}

/**
 * ‏§1.4 — הפירוק לשני רכיבי השונות: מה שמעל רצפת רעש הביצוע הוא **שונות
 * פרשנית** — אשמת הפרומפט, ניתנת לתיקון; הרצפה עצמה היא אשמת המודל, ואינה
 * נסגרת בפרומפט סגור ככל שיהיה.
 *
 * הרצפה נמדדת **פעם אחת, לפני הכול** — פרומפט סגור-מקסימלית N פעמים — וכל
 * פרומפט אחר מושווה אליה. בלי מדידת הרצפה כל מספר אחידות חסר משמעות, ולכן
 * `null` כשאחד הצדדים לא נמדד: "לא ידוע" הוא מידע נכון (אותה הנמקה כמו
 * `textUsd`), ואפס מומצא היה מציג פרומפט רועש כסגור.
 */
export function interpretiveExcess(sample: Dispersion, floor: Dispersion): number | null {
  if (sample.cv === null || floor.cv === null) return null;
  return Math.max(0, sample.cv - floor.cv);
}

/* ===== העלות ===== */

/**
 * מחיר קריאת התמונה — **נמדד**, ולכן הוא מספר ולא הערכה.
 *
 * ‏`gpt-image-1-mini · low · 1536x1024` = ‏$0.0057 לקריאה, מה-`usage` שהתשובה
 * החזירה (31/07, ראה `lib/llm/imagegen.ts`). זה הרכיב הדומיננטי בעלות של סבב,
 * ולכן הוא גם מה שהופך "כמה סבבים" למספר בדולרים.
 */
export const IMAGE_CALL_USD = 0.0057;

/**
 * מחיר לטוקן לפי מודל טקסט, ‏$ למיליון — **רק מה שפורסם**.
 *
 * ‏§5.1 ב-DIALOGUE_PLAN מציין במפורש שמחיר `gpt-5.6-luna` **לא אומת**, ולכן
 * הוא אינו כאן: `textUsd` יחזיר `null` והדוח יציג טוקנים. זה מכוון. עמודת
 * דולרים עם מספר מומצא בדוח שמכריע בין מסלולים היא הדרך הבטוחה ביותר להכריע
 * לכיוון הלא נכון, ו"לא ידוע" הוא מידע נכון.
 *
 * להוסיף מודל = לאמת בדף התמחור של הספק ולהוסיף שורה. המספרים כאן נכונים
 * לאוגוסט 2026 לפי §5.1, והם משתנים לעיתים בלי הודעה.
 */
export const TEXT_PRICES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gpt-5.2": { inputPerM: 0.875, outputPerM: 7.0 },
  "claude-sonnet-5": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-haiku-4.5": { inputPerM: 1.0, outputPerM: 5.0 },
  "glm-5.2": { inputPerM: 1.4, outputPerM: 4.4 },
  "qwen-3.8-max": { inputPerM: 2.0, outputPerM: 6.0 },
  "deepseek-v4-flash": { inputPerM: 0.14, outputPerM: 0.28 },
  "deepseek-v4-pro": { inputPerM: 0.435, outputPerM: 0.87 },
};

/**
 * מה הקריאה עלתה, בדולרים. `null` = אין מחיר מאומת למודל הזה.
 *
 * `outputTokens` כבר כולל את טוקני החשיבה אצל ספק שמדווח אותם ככה — לכן הם
 * **אינם** מחוברים שוב. זו הייתה הטעות שההערה בראש `designStage` מתעדת:
 * אומדן שנגזר מאורך התשובה מפספס בדיוק את החלק היקר, וחיבור כפול טועה
 * בכיוון השני.
 */
export function textUsd(usage: LlmUsage | null | undefined, model: string): number | null {
  const price = TEXT_PRICES[model];
  if (!price || !usage) return null;
  return (
    (usage.inputTokens / 1_000_000) * price.inputPerM
    + (usage.outputTokens / 1_000_000) * price.outputPerM
  );
}

/* ===== הסבב, הזרוע והסשן ===== */

/** מסלול אחד מתוך השניים שנמדדים זה מול זה. */
export type LabArm = "baseline" | "dialogue";

/**
 * סבב אחד: בקשה אחת, במסלול אחד.
 *
 * `satisfied` ו-`intentCaptured` הם השיפוט האנושי, והם `null` עד שדורגו —
 * ‏`false` פירושו "נבדק ולא", וזה לא אותו דבר. סשן שנעצר באמצע חייב להיראות
 * כמו סשן שנעצר באמצע ולא כמו כישלון.
 */
export interface LabRound {
  arm: LabArm;
  /** הבקשה בעברית, כפי שנשלחה בסבב הזה. */
  request: string;
  /** מה שנמסר בפועל למודל התמונה כבקשת השינוי. */
  imagePrompt: string;
  /** ‏`image_instruction` של שלב הטקסט. ריק במסלול הקיים — אין שלב כזה. */
  instruction?: string | null;
  /** כמה ניסיונות שלב הטקסט דרש. `null` במסלול הקיים. `1` = נפענח בראשון. */
  attempts?: number | null;
  /** שלב הטקסט נפל בכל הניסיונות ונפלנו ל-`buildEditPrompt`. */
  stageDown?: boolean;
  /** מה המודל הכריע (‏PROMPT_SPEC §6). `null` במסלול הקיים. */
  strategy?: string | null;
  /** הסבב צויר מחדש מהמפרט, בלי תמונת ייחוס. הפער בין זה ל-`strategy` —
   *  ‏respec שהוצהר וירד לייחוס (מפרט ריק) — הוא נתון בפני עצמו. */
  respec?: boolean;
  usage?: LlmUsage | null;
  /** כמה קריאות למודל התמונה הסבב הזה קנה. כמעט תמיד 1 — ראה `panels.ts`. */
  imageCalls?: number;
  /** **המטריקה.** "זה מה שביקשתי". `null` = טרם דורג. */
  satisfied: boolean | null;
  /** ציר 1: האם הכוונה שנקלטה היא הכוונה. דירוג עיוור. `null` = טרם דורג. */
  intentCaptured: boolean | null;
}

export interface ArmSummary {
  arm: LabArm;
  rounds: number;
  /**
   * הסבב שבו הלקוחה אמרה "זה מה שביקשתי", ‏1-based. `null` = לא הגיעה לשם
   * בסבבים שנמדדו.
   *
   * **`null` אינו אפס ואינו "גרוע מ-5".** הוא "לא ידוע, ולפחות N" — וממוצע
   * שמתייחס אליו כמספר הוא בדיוק השקר שמדד כזה מייצר. ראה `compareArms`.
   */
  roundsToSatisfaction: number | null;
  /** קריאות התמונה עד ההצלחה (או עד סוף מה שנמדד). */
  imageCalls: number;
  imageUsd: number;
  /** טוקני שלב הטקסט — קלט, פלט וסך הכול. אפס במסלול הקיים. */
  textTokens: { input: number; output: number; total: number };
  /** עלות שלב הטקסט. `null` = אין מחיר מאומת למודל. */
  textUsd: number | null;
  /** סך הכול. `null` כש-`textUsd` אינו ידוע — ולא "העלות של התמונה בלבד". */
  totalUsd: number | null;
  /** אחוז הסבבים ששלב הטקסט נפענח בהם בניסיון הראשון. `null` במסלול הקיים. */
  firstParseRate: number | null;
  /** כמה סבבים נפלו־לאחור ל-`buildEditPrompt`. */
  stageDowns: number;
  /** כמה סבבים צוירו מחדש מהמפרט (‏respec) — המונה של מדידת שימור ה-scope. */
  respecRounds: number;
  /** ציר 1, מצטבר: מתוך הסבבים שדורגו, בכמה הכוונה נקלטה. */
  intentCaptured: { rated: number; captured: number };
  /** ציר 2, מצטבר: ממוצע הכיסוי (0–4) וכמה הוראות נשארו בעברית. */
  instruction: { graded: number; avgCovered: number | null; hebrew: number; echo: number };
}

/**
 * סיכום זרוע אחת.
 *
 * **הספירה נעצרת בסבב שבו הלקוחה הייתה מרוצה**, וזה כל העניין: סבבים שנמדדו
 * *אחרי* שהיא כבר קיבלה את מה שביקשה אינם חלק מהעלות של המסלול. הרתמה מריצה
 * לפעמים גם אותם (כדי לראות אם המסלול השני עוד מתקן), והם רק היו מעוותים.
 */
export function summariseArm(arm: LabArm, all: LabRound[], textModel: string): ArmSummary {
  const rounds = all.filter((r) => r.arm === arm);
  const hitAt = rounds.findIndex((r) => r.satisfied === true);
  const counted = hitAt >= 0 ? rounds.slice(0, hitAt + 1) : rounds;

  const imageCalls = counted.reduce((n, r) => n + (r.imageCalls ?? 1), 0);
  const tokens = counted.reduce(
    (acc, r) => ({
      input: acc.input + (r.usage?.inputTokens ?? 0),
      output: acc.output + (r.usage?.outputTokens ?? 0),
      total: acc.total + (r.usage?.totalTokens ?? 0),
    }),
    { input: 0, output: 0, total: 0 },
  );
  // אפס טוקנים = לא רץ שלב טקסט (המסלול הקיים), ואז העלות שלו היא אפס ולא
  // "לא ידוע": אין מה לתמחר. `null` שמור למצב שבו הוא כן רץ ואין לו מחיר.
  const text = tokens.total
    ? textUsd({ inputTokens: tokens.input, outputTokens: tokens.output, totalTokens: tokens.total }, textModel)
    : 0;
  const imageUsd = imageCalls * IMAGE_CALL_USD;

  const withAttempts = counted.filter((r) => typeof r.attempts === "number");
  const graded = counted.filter((r) => (r.instruction ?? "").trim());
  const grades = graded.map((r) => gradeInstruction(r.instruction));
  const rated = counted.filter((r) => r.intentCaptured !== null && r.intentCaptured !== undefined);

  return {
    arm,
    rounds: counted.length,
    roundsToSatisfaction: hitAt >= 0 ? hitAt + 1 : null,
    imageCalls,
    imageUsd,
    textTokens: tokens,
    textUsd: text,
    totalUsd: text === null ? null : imageUsd + text,
    firstParseRate: withAttempts.length
      ? withAttempts.filter((r) => r.attempts === 1).length / withAttempts.length
      : null,
    stageDowns: counted.filter((r) => r.stageDown).length,
    respecRounds: counted.filter((r) => r.respec).length,
    intentCaptured: { rated: rated.length, captured: rated.filter((r) => r.intentCaptured).length },
    instruction: {
      graded: grades.length,
      avgCovered: grades.length
        ? grades.reduce((n, g) => n + g.covered, 0) / grades.length
        : null,
      hebrew: grades.filter((g) => g.hebrew).length,
      echo: grades.filter((g) => g.echo).length,
    },
  };
}

/** בקשה אחת אמיתית, נמדדת בשתי הזרועות. */
export interface LabSession {
  /** ‏`generation_runs.id` שממנו הבקשה נלקחה — כדי שיהיה אפשר לחזור למקור. */
  runId: string;
  /** הבקשה המקורית בעברית. */
  request: string;
  productType: "bracelet" | "ring";
  rounds: LabRound[];
}

export interface SessionReport {
  runId: string;
  request: string;
  baseline: ArmSummary;
  dialogue: ArmSummary;
  /**
   * כמה סבבים נחסכו. חיובי = המסלול החדש הגיע מהר יותר. `null` = לפחות אחת
   * מהזרועות לא הגיעה ל"זה מה שביקשתי", ואז אין הפרש אלא רק חצי מדידה.
   */
  roundsSaved: number | null;
  /** כמה עלה ההפרש. `null` כשאין מחיר מאומת לשלב הטקסט, או שאין הפרש סבבים. */
  usdSaved: number | null;
}

export function reportSession(session: LabSession, textModel: string): SessionReport {
  const baseline = summariseArm("baseline", session.rounds, textModel);
  const dialogue = summariseArm("dialogue", session.rounds, textModel);
  const both = baseline.roundsToSatisfaction !== null && dialogue.roundsToSatisfaction !== null;
  return {
    runId: session.runId,
    request: session.request,
    baseline,
    dialogue,
    roundsSaved: both ? baseline.roundsToSatisfaction! - dialogue.roundsToSatisfaction! : null,
    usdSaved: both && baseline.totalUsd !== null && dialogue.totalUsd !== null
      ? baseline.totalUsd - dialogue.totalUsd
      : null,
  };
}

export interface LabReport {
  textModel: string;
  sessions: SessionReport[];
  /** כמה בקשות הגיעו ל"זה מה שביקשתי" **בשתי** הזרועות. רק הן נספרות בהפרש. */
  decided: number;
  /** כמה בקשות נמדדו בסך הכול. `decided < total` הוא מה שמסייג את המסקנה. */
  total: number;
  /** ממוצע הסבבים עד שביעות רצון, על הבקשות שהוכרעו בשתיהן. */
  avgRounds: { baseline: number | null; dialogue: number | null };
  /** ממוצע העלות המצטברת, על אותן בקשות. `null` בלי מחיר מאומת. */
  avgUsd: { baseline: number | null; dialogue: number | null };
  /** ציר 2, על כל הסבבים של המסלול החדש. */
  instruction: { graded: number; avgCovered: number | null; hebrew: number; echo: number };
  /** ציר 1, על כל הסבבים שדורגו, בשתי הזרועות. */
  intent: { baseline: { rated: number; captured: number }; dialogue: { rated: number; captured: number } };
  /** יציבות ה-JSON של שלב הטקסט, על כל הסבבים. */
  firstParseRate: number | null;
}

/**
 * הדוח.
 *
 * **הממוצעים נלקחים רק על בקשות שהוכרעו בשתי הזרועות**, ולא על מה שנמדד.
 * בקשה שהמסלול החדש פתר בסבב 2 והמסלול הישן לא פתר בכלל היא הראיה החזקה
 * ביותר שיש — ודווקא היא הייתה מושכת את הממוצע של הישן **למטה** אם היו
 * סופרים לו "5" או מדלגים עליו רק אצלו. לכן היא יוצאת משני הממוצעים ונספרת
 * ב-`decided` מול `total`, שהם מה שמסייג את המסקנה.
 */
export function reportLab(sessions: LabSession[], textModel: string): LabReport {
  const reports = sessions.map((s) => reportSession(s, textModel));
  const decided = reports.filter((r) => r.roundsSaved !== null);
  const mean = (ns: Array<number | null>) => {
    const real = ns.filter((n): n is number => n !== null);
    return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
  };
  const pile = (pick: (r: SessionReport) => ArmSummary) => reports.map(pick);
  const allDialogue = pile((r) => r.dialogue);

  const gradedTotal = allDialogue.reduce((n, a) => n + a.instruction.graded, 0);
  const attemptsRounds = sessions.flatMap((s) => s.rounds).filter((r) => typeof r.attempts === "number");

  return {
    textModel,
    sessions: reports,
    decided: decided.length,
    total: reports.length,
    avgRounds: {
      baseline: mean(decided.map((r) => r.baseline.roundsToSatisfaction)),
      dialogue: mean(decided.map((r) => r.dialogue.roundsToSatisfaction)),
    },
    avgUsd: {
      baseline: mean(decided.map((r) => r.baseline.totalUsd)),
      dialogue: mean(decided.map((r) => r.dialogue.totalUsd)),
    },
    instruction: {
      graded: gradedTotal,
      avgCovered: gradedTotal
        // ממוצע משוקלל לפי מספר הסבבים ולא ממוצע של ממוצעים: סשן עם סבב אחד
        // וסשן עם חמישה אינם אותה עדות.
        ? allDialogue.reduce((n, a) => n + (a.instruction.avgCovered ?? 0) * a.instruction.graded, 0) / gradedTotal
        : null,
      hebrew: allDialogue.reduce((n, a) => n + a.instruction.hebrew, 0),
      echo: allDialogue.reduce((n, a) => n + a.instruction.echo, 0),
    },
    intent: {
      baseline: sumRated(pile((r) => r.baseline)),
      dialogue: sumRated(allDialogue),
    },
    firstParseRate: attemptsRounds.length
      ? attemptsRounds.filter((r) => r.attempts === 1).length / attemptsRounds.length
      : null,
  };
}

function sumRated(arms: ArmSummary[]): { rated: number; captured: number } {
  return {
    rated: arms.reduce((n, a) => n + a.intentCaptured.rated, 0),
    captured: arms.reduce((n, a) => n + a.intentCaptured.captured, 0),
  };
}

/* ===== הדירוג העיוור ===== */

/**
 * באיזה סדר להציג את שתי הזרועות למדרג — **דטרמיניסטי, לפי הבקשה**.
 *
 * ‏§7.1 דורש דירוג עיוור, ומדרג שיודע איזה צד הוא החדש מדרג את הציפייה שלו.
 * החלפה קבועה אינה עיוורון (אחרי שלוש בקשות המדרג לומד את הסדר), אבל גם
 * `Math.random` אינו התשובה: דוח שאי אפשר לשחזר אינו דוח, וטסט על פונקציה
 * אקראית אינו טסט. לכן הסדר נגזר מהמפתח — אותה בקשה תמיד באותו סדר, ובקשות
 * שונות בסדרים שונים.
 */
export function blindOrder(key: string): [LabArm, LabArm] {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % 2 === 0 ? ["baseline", "dialogue"] : ["dialogue", "baseline"];
}
