// dialogue mode — המפרט המצטבר, וההחלטה שמעדכנת אותו (§2.2 ב-DIALOGUE_PLAN;
// הסכמה והמקורות — §1.3 ו-§2 ב-PROMPT_SPEC).
//
// **למה זה קובץ נפרד מ-`editStage.ts`.** שני קוראים שונים לגמרי צריכים את
// הטיפוסים האלה: שלב הטקסט, שמדבר עם ספק LLM, ושכבת ה-DB, ששומרת אותם
// ב-`RunInputs` (jsonb). קובץ אחד היה גורר את לקוח ה-LLM לתוך `lib/db/runs.ts`
// בשביל שדות מחרוזת. כאן אין שום תלות ריצה — טיפוסים ופונקציות טהורות.
//
// **"עריכה של תמונה הופכת לעריכת פרומפט".** התרגום המעשי: לכל עיצוב נשמר
// מפרט מצטבר, ובכל סבב מודל הטקסט **עורך אותו** ולא מחבר הוראה מאפס. זה מה
// שפותר את הכשל האמיתי של עריכה מצטברת — היום סבב 5 אינו יודע מה נקבע בסבב 2,
// כי כל סבב רואה רק את התמונה ואת המשפט האחרון, ולכן "תחזירי את הקצב שהיה
// בהתחלה" הוא בקשה שאין לה למה להתייחס.
//
// **ומאז PROMPT_SPEC §6 המפרט הוא גם מקור התמונה, לא רק ההקשר.** ברירת
// המחדל בעריכה היא respec: התמונה נוצרת מחדש מהמפרט הסגור, בלי תמונת ייחוס.
// מה שמחזיק את "כל השאר נשאר" בלי ייחוס הוא בדיוק שני הדברים שהקובץ הזה
// מוסיף: סגירת דרגות החופש של §2 (השדות החדשים), והמקורות של §1.3 — שדות
// `user` קפואים, וה-respec נוגע רק במה שהבקשה ביקשה.

/**
 * מקור של שדה במפרט (§1.3 ב-PROMPT_SPEC) — מי הכריע את הערך, וכמה חופש
 * נשאר למודל הטקסט סביבו:
 *
 *  - `user` — המשתמשת אמרה או אישרה במפורש. **קפוא**; משתנה רק אם בקשת
 *    שינוי נוגעת בו במפורש.
 *  - `inferred` — הוסק מדבריה. יציב; מותר לכוונן אם הבקשה מרמזת שההסקה
 *    פספסה.
 *  - `chosen` — מודל הטקסט בחר כי מישהו חייב. חופשי לבחירה מחדש — אבל
 *    תמיד מוכרע, אף שדה לא נמסר פתוח.
 *
 * המקור קובע את חופש הפעולה של מודל **הטקסט** בלבד. בדרך למודל התמונה כל
 * השדות שווים — סגורים.
 */
export type FieldSource = "user" | "inferred" | "chosen";

/** ‏user גובר על inferred גובר על chosen. המספרים רק לצורך ההשוואה. */
const SOURCE_RANK: Record<FieldSource, number> = { chosen: 0, inferred: 1, user: 2 };

export function isFieldSource(value: unknown): value is FieldSource {
  return value === "user" || value === "inferred" || value === "chosen";
}

/** שדות הטקסט של המפרט — אלה שמושווים כמחרוזות ומודפסים לפרומפט. */
export type SpecTextField =
  | "outer_silhouette"
  | "metal_structure"
  | "negative_space"
  | "rhythm_balance"
  | "symmetry"
  | "ends_treatment"
  | "metal_void_balance"
  | "elements"
  | "region_map"
  | "manufacturability";

/** כל שדה שיכול לשאת מקור — שדות הטקסט והיחס. */
export type SpecField = SpecTextField | "length_to_width_ratio";

/** מקור לכל שדה שנכתב. חלקי בכוונה: שדה בלי תיוג נקרא `inferred` —
 *  ראה `sourceOf`. */
export type SpecSources = Partial<Record<SpecField, FieldSource>>;

/**
 * המפרט המצטבר של עיצוב.
 *
 * **חמשת השדות הראשונים הם בדיוק אלה שיוצאים מ-`designStage`**
 * (`DesignDirection` ב-lib/story/designStage.ts) — הזהות הזו היא גשר ההזרעה:
 * מפרט שנוצר ביצירה נכנס לסבב העריכה הראשון בלי תרגום. **היתר הם הרחבה של
 * צד העריכה בלבד** (‏PROMPT_SPEC §2.1–2.3), כולם אופציונליים בכוונה: סכמת
 * היצירה נמדדה ואינה משתנה כאן, והזרעה פשוט משאירה אותם ריקים עד שסבב
 * עריכה מכריע אותם. שדה חדש שהיה חובה היה כופה קיום (לקח 3).
 *
 * הכול אופציונלי: עיצוב שנוצר במסלול הרגיל אינו נושא מפרט בכלל, וזה מצב
 * תקין — ראה `EDIT_SPEC_NONE`.
 */
export interface EditSpec {
  outer_silhouette?: string;
  metal_structure?: string;
  negative_space?: string;
  rhythm_balance?: string;
  manufacturability?: string;
  /** ‏§2.1 — מראָה לאורך, מראָה סביב המרכז, א־סימטרי מכוון. עד עכשיו נבלע
   *  בתוך `rhythm_balance` בלי הכרעה מפורשת, וזה ציר שמשתמשים רואים מיד. */
  symmetry?: string;
  /** ‏§2.1 — איך שני הקצוות נגמרים. הצמיד הוא cuff: הקצוות פוגשים זה את זה
   *  על היד והם חלק בולט מהפריט, ועד עכשיו אף שדה לא הכריע אותם. */
  ends_treatment?: string;
  /** ‏§2.1 — כבד/מלא מול אוורירי/פתוח, כמותית ("כשליש מהשטח פתוח"). זה
   *  התרגום של "עדין/עמוס" ממילון המשתמש (§4). */
  metal_void_balance?: string;
  /**
   * ‏§2.2 — שכבת האלמנטים, כשדה חופשי-מבנה אחד ולא כמערך פר-אלמנט:
   * התיאור עוקב אחרי מבנה העיצוב, לא אחרי תבנית קבועה (§2.3, לקח 3 —
   * מערך חובה היה כופה מניין אלמנטים גם על עיצוב של קו נודד אחד). מה
   * שהשדה חייב להכריע יושב בהנחיות הפרומפט: מניין מדויק, עובי קו כיחס
   * בתוך התמונה, צפיפות, מיקום, פינות — "או שאין אלמנטים חוזרים".
   */
  elements?: string;
  /** ‏§2.3 — שכבת המיעון: אילו אלמנטים יושבים בשליש הימני/המרכזי/השמאלי,
   *  מיושר לצ'יפים של ממשק העריכה. אנוטציה על התיאור המבני, לא תחליף לו. */
  region_map?: string;
  /**
   * היחס אורך-רוחב של הפריט — הציר של §2.1 שתמונת הייחוס נשאה במרומז,
   * וב-respec אין ממי לרשת אותו: בלי השדה הזה יצירה-מחדש מהמפרט הייתה
   * מטילה קובייה על הרוחב. מוזרע מ-`DesignDirection.length_to_width_ratio`.
   */
  length_to_width_ratio?: number;
  /**
   * מקור לכל שדה שנכתב (§1.3). נוסע **בתוך** המפרט ולא לצידו כדי שכל
   * השרשרת הקיימת — ‏jsonb, הזרעה, הרתמה — תישא אותו בלי חיווט נוסף.
   * מפרט היסטורי בלי המפה נקרא `inferred` על כל שדה: יציב, לא חופשי —
   * ההנחה השמרנית, כי "חופשי" היה מתיר ל-respec לשכתב פריט שנבחר.
   */
  sources?: SpecSources;
}

/**
 * אסטרטגיית העריכה (‏PROMPT_SPEC §6):
 *
 *  - `respec` — **ברירת המחדל.** המפרט מתעדכן והתמונה נוצרת מחדש ממנו,
 *    בלי תמונת ייחוס (`/v1/images/generations`).
 *  - `clarify` — הבקשה מחוץ למדיום (§2.5). נרשם ואינו נאכף בשלב A — המסלול
 *    עדיין אינו יכול לשאול; הסבב ממשיך כ-respec על החלק שהמדיום מקיים.
 *  - `reference_edit` — שמור לנפילה-לאחור; לא מוצע למודל ואינו בשימוש עד
 *    שמדידת שימור ה-scope תצדיק אותו. בפועל זה גם המסלול של מפרט ריק —
 *    ראה `runsRespec`.
 */
export const EDIT_STRATEGIES = ["respec", "clarify", "reference_edit"] as const;

export type EditStrategy = (typeof EDIT_STRATEGIES)[number];

/** מה שמודל הטקסט מחזיר לכל בקשת שינוי. */
export interface EditDecision {
  /**
   * ההכרעה של §6 — ‏respec, בקשת הבהרה, או עריכת ייחוס. חסר = `respec`,
   * שהיא ברירת המחדל; מי שמכריע בפועל אם הייחוס נשלח הוא `runsRespec`,
   * כי גם מפרט ריק שולל respec ולא רק הצהרת המודל.
   */
  strategy?: EditStrategy;
  /**
   * ההיקף שהמודל הכריע עליו, במילותיו. תיאורי — הוא נכנס לפרומפט של מודל
   * התמונה, והוא גם מה שנקרא ביומן כשמסתכלים למה שינוי "מקומי" שינה הכול.
   */
  scope?: string;
  /**
   * הוראת הציור. **זה השדה שקובע**, וזה גם השדה היחיד שהקבילות נבדקת עליו:
   * בלעדיו אין מה למסור למודל התמונה, ומפרט חלקי גרוע ממפרט שאין.
   *
   * ב-respec זו הוראה **מלאה** על הפריט כולו כפי שיהיה — היא עומדת לבדה,
   * כי המודל שיצייר אותה לא ראה את הפריט מעולם. בעריכת ייחוס זו דלתא.
   */
  image_instruction?: string;
  /** מה שהבקשה לא נגעה בו ולכן נשאר. **רלוונטי לעריכת ייחוס בלבד** — בלי
   *  תמונה מצורפת אין לו על מה להצביע, וב-respec השימור יושב במפרט עצמו. */
  preserve?: string[];
  /**
   * המודל לא הבין את הבקשה מספיק כדי לתרגם אותה — או שהיא מחוץ למדיום.
   *
   * **בשלב A זה נרשם ואינו נאכף** (החלטת גל): המסלול עדיין אינו יכול לשאול —
   * מסך השיחה הוא שלב B. השדה קיים מעכשיו כי הוא מה שימדוד את *כמות*
   * המקרים שבהם שאלה הייתה חוסכת סבב, וזו בדיוק ההצדקה שתידרש לשלב B.
   * הרצה עם `needs_clarification` ממשיכה רגיל, והשאלה נרשמת ביומן.
   */
  needs_clarification?: string;
  /** המפרט אחרי השינוי, כולל `sources`. חסר = המודל לא עדכן, והקודם נשמר.
   *  ראה `nextEditSpec`. */
  updated_spec?: EditSpec;
}

/** סדר שדות הטקסט בפרומפט — קבוע, כדי ששתי הרצות של אותו מפרט יהיו אותו
 *  טקסט. השדות החדשים לפני `manufacturability`: קודם מה הפריט, בסוף למה
 *  הוא שורד ייצור. */
export const SPEC_FIELDS: ReadonlyArray<readonly [SpecTextField, string]> = [
  ["outer_silhouette", "Outer silhouette"],
  ["metal_structure", "Metal structure"],
  ["negative_space", "Negative space"],
  ["rhythm_balance", "Rhythm and balance"],
  ["symmetry", "Symmetry"],
  ["ends_treatment", "Ends"],
  ["metal_void_balance", "Metal-void balance"],
  ["elements", "Elements"],
  ["region_map", "Region map (right / centre / left)"],
  ["manufacturability", "Manufacturability"],
];

/** התווית של שורת היחס בפרומפט. קבועה כאן כדי ששני הכותבים — התיאור
 *  והבדיקות — יאייתו אותה זהה. */
const RATIO_LABEL = "Length-to-width ratio";

/**
 * מה שנכתב במקום המפרט כשאין מפרט — הסבב הראשון על עיצוב שנוצר במסלול הרגיל.
 *
 * משפט ולא מחרוזת ריקה: כותרת עם כלום מתחתיה נקראת כמפרט ריק, כלומר כפריט
 * בלי צללית ובלי מבנה, וזו הצהרה שגויה על פריט שקיים ומצויר בתמונה המצורפת.
 *
 * מאז ההזרעה (§9.2 ב-DIALOGUE_PLAN) זה בעיקר המצב של עיצובים מלפני שנשמר
 * `designIndex` — והם גם בדיוק העיצובים ש-respec אסור לרוץ עליהם: יצירה
 * מחדש ממפרט שאינו קיים אינה עריכה אלא פריט חדש. ראה `runsRespec`.
 */
export const EDIT_SPEC_NONE =
  "Not recorded. This piece was designed before the specification was kept, so describe what the change implies about it rather than assuming what it already is.";

/**
 * מקור של שדה, כפי שהוא נקרא: תיוג מפורש אם יש, ואחרת `inferred`.
 *
 * ברירת המחדל היא `inferred` ולא `chosen` בכוונה — מפרט היסטורי בלי תיוג
 * מתאר פריט שהלקוחה כבר ראתה ובחרה, ו"חופשי לבחירה מחדש" היה מתיר ל-respec
 * לשכתב אותו. יציב-אבל-ניתן-לכוונון הוא הקריאה הזהירה של מה שלא נרשם.
 */
export function sourceOf(spec: EditSpec | null | undefined, field: SpecField): FieldSource {
  const tagged = spec?.sources?.[field];
  return isFieldSource(tagged) ? tagged : "inferred";
}

/** היחס שהמפרט נושא, אם הוא שמיש. `null` על כל דבר אחר — כולל זבל שהגיע
 *  מ-jsonb היסטורי. */
export function ratioOf(spec: EditSpec | null | undefined): number | null {
  const n = Number(spec?.length_to_width_ratio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * המפרט המצטבר, כפי שהוא נכתב בפרומפט. `null` וכן מפרט שכל שדותיו ריקים —
 * שניהם `EDIT_SPEC_NONE`: מפרט שיש בו רק כותרות הוא הצהרה על פריט ריק.
 *
 * `sources: true` מוסיף לכל שורה את תיוג המקור — `[user]`, `[inferred]`,
 * `[chosen]` — לפרומפט **התכנון** בלבד. לפרומפט של מודל התמונה המקורות
 * אינם נמסרים לעולם: שם כל השדות שווים — סגורים (§1.3), ותיוג היה בדיוק
 * "אוצר מילים בפרומפט הביצוע" ש-§2.4 אוסר.
 */
export function describeSpec(
  spec: EditSpec | null | undefined,
  opts?: { sources?: boolean },
): string {
  const mark = (field: SpecField): string => (opts?.sources ? ` [${sourceOf(spec, field)}]` : "");
  const lines = SPEC_FIELDS
    .map(([key, label]) => [key, label, spec?.[key]?.trim()] as const)
    .filter((row): row is readonly [SpecTextField, string, string] => Boolean(row[2]))
    .map(([key, label, value]) => `${label}${mark(key)}: ${value}`);
  const ratio = ratioOf(spec);
  if (ratio !== null && lines.length) {
    lines.push(`${RATIO_LABEL}${mark("length_to_width_ratio")}: 1:${Math.round(ratio * 10) / 10}`);
  }
  return lines.length ? lines.join("\n") : EDIT_SPEC_NONE;
}

/**
 * מיזוג מקור לשדה אחד.
 *
 * ערך שהשתנה בסבב הזה מקבל את מה שהמודל הצהיר — ובלי הצהרה, `chosen`:
 * בחירה שלא יוחסה לאיש היא של המודל. ערך שלא השתנה יכול רק **להתחזק**
 * (‏chosen → inferred → user, ‏§3.5: "שדות זזים שמאלה") — מודל אינו מפשיר
 * שדה `user` בשקט על ידי תיוג מחודש, כי זה בדיוק מה שהיה מתיר ל-respec
 * לסטות ממה שהמשתמשת קיבעה.
 */
function mergedSource(
  prev: FieldSource | undefined,
  declared: FieldSource | undefined,
  changed: boolean,
): FieldSource | undefined {
  if (changed) return declared ?? "chosen";
  if (!declared) return prev;
  // חסר נקרא inferred (ראה sourceOf) — וזה גם הרף שהצהרה חדשה נמדדת מולו.
  const held = prev ?? "inferred";
  return SOURCE_RANK[declared] > SOURCE_RANK[held] ? declared : prev;
}

/**
 * המפרט לסבב הבא.
 *
 * **מיזוג שדה־שדה ולא החלפה.** מודל שהחזיר `updated_spec` חלקי — שלושה שדות
 * מתוך עשרה — לא הצהיר שהיתר נעלמו; הוא פשוט לא כתב אותם. החלפה הייתה
 * מוחקת בסבב אחד מה שנקבע בחמישה, וזה בדיוק הכשל שהמפרט המצטבר קיים
 * כדי למנוע. שדה ריק או רווחים בלבד נחשב "לא נכתב".
 *
 * המקורות ממוזגים לצד הערכים, עם השמירה של `mergedSource`; תיוג שאינו
 * אחד משלושת הערכים נזרק בשקט — ‏jsonb היסטורי יכול לשאת כל דבר.
 */
export function nextEditSpec(prev: EditSpec | null | undefined, decision: EditDecision): EditSpec {
  const out: EditSpec = { ...(prev ?? {}) };
  const update = decision.updated_spec;
  const declared = update?.sources;

  // רק תיוגים תקפים עוברים הלאה — גם מהמפרט הקודם וגם מההצהרה של הסבב.
  const sources: SpecSources = {};
  for (const [key] of SPEC_FIELDS) {
    const held = prev?.sources?.[key];
    if (isFieldSource(held)) sources[key] = held;
  }
  const heldRatio = prev?.sources?.length_to_width_ratio;
  if (isFieldSource(heldRatio)) sources.length_to_width_ratio = heldRatio;

  if (update && typeof update === "object") {
    for (const [key] of SPEC_FIELDS) {
      const value = update[key];
      if (typeof value === "string" && value.trim()) {
        const next = value.trim();
        const source = mergedSource(
          sources[key],
          isFieldSource(declared?.[key]) ? declared?.[key] : undefined,
          next !== prev?.[key]?.trim(),
        );
        out[key] = next;
        if (source) sources[key] = source;
        else delete sources[key];
      }
    }
    const nextRatio = ratioOf(update);
    if (nextRatio !== null) {
      const source = mergedSource(
        sources.length_to_width_ratio,
        isFieldSource(declared?.length_to_width_ratio) ? declared?.length_to_width_ratio : undefined,
        nextRatio !== ratioOf(prev),
      );
      out.length_to_width_ratio = nextRatio;
      if (source) sources.length_to_width_ratio = source;
      else delete sources.length_to_width_ratio;
    }
  }

  // יחס פסול שנגרר מה-jsonb אינו ממשיך לנסוע: `ratioOf` כבר קרא אותו כחסר,
  // והשארתו הייתה מדפיסה אותו לפרומפט הבא בכל זאת.
  if (out.length_to_width_ratio !== undefined && ratioOf(out) === null) {
    delete out.length_to_width_ratio;
  }
  if (Object.keys(sources).length) out.sources = sources;
  else delete out.sources;
  return out;
}

/** האם יש כאן מפרט בכלל — לפחות שדה טקסט אחד שנכתב. יחס לבדו אינו מפרט:
 *  אי אפשר לצייר ממנו פריט, ולכן הוא גם אינו מתיר respec. */
export function hasSpec(spec: EditSpec | null | undefined): boolean {
  return SPEC_FIELDS.some(([key]) => Boolean(spec?.[key]?.trim()));
}

/**
 * מפרט שהגיע מבחוץ — מהלקוח של הרתמה או מ-jsonb — מנוקה לצורה שמותר להמשיך
 * איתה. `null` כשאין בו כלום: מה שאינו מחרוזת בשדה טקסט, אינו מספר חיובי
 * ביחס, או אינו תיוג תקף — נזרק בשקט, כי קלט חיצוני אינו הצהרה.
 */
export function coerceEditSpec(raw: unknown): EditSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const box = raw as Record<string, unknown>;
  const out: EditSpec = {};
  for (const [key] of SPEC_FIELDS) {
    const value = box[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  const ratio = Number(box.length_to_width_ratio);
  if (Number.isFinite(ratio) && ratio > 0) out.length_to_width_ratio = ratio;
  const rawSources = box.sources;
  if (rawSources && typeof rawSources === "object" && !Array.isArray(rawSources)) {
    const sources: SpecSources = {};
    for (const [key] of SPEC_FIELDS) {
      const tag = (rawSources as Record<string, unknown>)[key];
      if (isFieldSource(tag)) sources[key] = tag;
    }
    const ratioTag = (rawSources as Record<string, unknown>).length_to_width_ratio;
    if (isFieldSource(ratioTag)) sources.length_to_width_ratio = ratioTag;
    if (Object.keys(sources).length) out.sources = sources;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * האם הסבב הזה מצויר מחדש מהמפרט — בלי תמונת ייחוס (‏PROMPT_SPEC §6).
 *
 * **זו הפונקציה שקובעת אם הייחוס נשלח**, ולכן היא טהורה ונבדקת, כמו
 * `runsEditStage`. שלושה תנאים, וכל אחד שולל בפני עצמו:
 *
 *  1. **המודל לא ביקש `reference_edit`.** חסר = `respec` (ברירת המחדל של
 *     §6); ‏`clarify` ממשיך כ-respec — השאלה נרשמת, שלב A אינו יכול לשאול.
 *  2. **יש מפרט מצטבר.** ‏respec על מפרט ריק אינו עריכה אלא פריט חדש —
 *     וזה בדיוק המצב של עיצובים מלפני #289, שאינם נושאים `designIndex`
 *     והמפרט שלהם מתחיל ריק. הם נשארים על עריכת הייחוס, וגם המדידה של A0
 *     אינה רצה עליהם — מפרט-מתחיל-ריק היה נמדד לרעת המסלול החדש.
 *  3. **אין כיתוב.** הכיתוב יושב בתוך התמונה הקיימת ואין לו ייצוג במפרט;
 *     יצירה מחדש הייתה מאבדת אותו. עריכת הייחוס משמרת אותו כמו היום.
 */
export function runsRespec(input: {
  decision?: EditDecision | null;
  priorSpec?: EditSpec | null;
  lettering?: boolean;
}): boolean {
  return (
    Boolean(input.decision)
    && input.decision?.strategy !== "reference_edit"
    && !input.lettering
    && hasSpec(input.priorSpec)
  );
}
