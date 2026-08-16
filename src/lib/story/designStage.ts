import { askOpenAi } from "@/lib/llm/openai";
import { addLlmUsage, type LlmUsage } from "@/lib/llm/core";
import type { RenderProductType } from "@/lib/llm/imagegen";
import type { Canvas } from "@/lib/render/canvas";
import { FAB } from "@/lib/fabrication.config";
import { ratioBandFor } from "./ratio";
import { numberWord } from "./prompt";

// story mode — שלב הטקסט שקודם למודל התמונה.
//
// **מה הבעיה שזה פותר.** עד כאן הסיפור הלך ישירות למודל התמונה, ומודל תמונה
// התבקש לעשות שני דברים בבת אחת: לפרש סיפור לצורה, ולצייר אותה בדיוק. את
// הראשון הוא עושה רע — מה שחזר היה מלבן שחור עם חיתוך רחב אחד, שלוש פעמים,
// בלי שהצללית החיצונית תשתתף. את השני הוא עושה טוב, אם אומרים לו בדיוק מה
// לצייר.
//
// מכאן הפיצול: מודל טקסט מתרגם את הסיפור לשלושה כיווני עיצוב גיאומטריים
// קונקרטיים (JSON), ומודל התמונה מבצע אותם. הוא כבר לא צריך לחשוב יצירתית —
// הוא צריך לצייר.
//
// **העלות.** ההערכה שנשאה כאן הייתה ~$0.002 להרצה (‏1,200 טוקני קלט ו-1,500
// פלט ב-$0.20/$1.20 למיליון), כלומר זניח מול קריאת התמונה. זה גם מה שמאפשר
// לחזור למודל התמונה הקטן: אם ההנחיות מדויקות, אין למה לשלם על מודל גדול.
//
// ⚠ **ההערכה הזו נגזרה מהחלק שרואים, שהוא החלק הלא-נכון.** המודל הזה חושב,
// וטוקני החשיבה מחויבים כפלט ואינם מופיעים ב-JSON שחוזר — כלומר "1,500 פלט"
// הוא אורך התשובה, לא מה ששולם. שלב התמונה נמדד ב-$0.008 להרצת Story (שלושה
// עיצובים, נמדד 14.8 מהיומן), והשלב הזה היה הנעלם היחיד שנשאר. מכאן הוא נשמר:
// `DesignStageResult.usage` → `RunInputs.designStage.usage`.
//
// **כשזה נכשל, המסלול ממשיך.** מודל טקסט שנפל, פג, או החזיר JSON שאי אפשר
// לקרוא — כל אלה מחזירים `null`, והצינור נופל חזרה לפרומפט של שלב אחד
// (lib/story/prompt.ts) שרץ עד עכשיו. יצירה לא נכשלת בגלל השלב הזה.
//
// ⚠ **שני הפרומפטים קוצצו ב-16.8 (החלטת גל), ולא כי הם היו ארוכים.**
//
// המדידה: חמש הרצות, חמישה סיפורים שונים, 18 מועמדים — ו-12 מהם אותה צורה
// בדיוק, עדשה במרכז רצועה עם מותן. עוד ארבעה יצאו פס חלק בלי שום עיצוב, גם
// בצמיד של 16–18 מ"מ שיש בו מקום למבנה. רק הסיפור שדרש במפורש זוויתיות
// ("חד, זוויתי, מנוכר") שבר את התבנית.
//
// הפרומפט למודל התמונה היה 137 שורות שמתוכן **52 שורות איסור**, וזה המנגנון:
// כל "אל תעשה X" מצמצם את מרחב הפתרונות, וכשמצמצמים מספיק נשארת צורה אחת
// שמספקת את כולם. שני האשמים הישירים היו (א) `negative_space` כשדה חובה
// שהוגדר כ-"Concrete description of the major laser-cut openings" — הסכמה
// עצמה הניחה שיש פתחים, ולכן כל עיצוב הצהיר על אחד; (ב) הכלל שנועד למנוע
// את זה, "DO NOT create a rectangular strip and place decorative holes inside
// it", שהמודל ציית לו **מילולית**: הוא לא עשה מלבן עם חורים, הוא עשה צורה
// מעוצבת עם חור אחד גדול. הכלל אסר על הקלישאה הקודמת ולא על הבאה אחריה.
//
// מכאן העיקרון: **מה שאינו חייב להיות בפרומפט — יוצא.** מה שנשאר הוא רק מה
// שהצינור באמת דורש: החוזה של הווקטורייזר (שחור מלא על לבן, שטוח, אורתוגרפי),
// החוזה של הפריסה (בדיוק N פריטים, אחד לשורה — כי הקופסה חותכת `plan.rows`
// פסים), היחסים, וחיבוריות (הדבר היחיד שהוולידציה פוסלת עליו קשה). ההנחיות
// האסתטיות — "premium", "intentional", "memorable", רשימות ה-Avoid — ירדו
// כולן. 337 שורות הפכו ל-66.
//
// מה שנמדד מול זה: `askedRatios` מול `drawnRatio`, ו-`approvedPanels` —
// אם שיעור הפסילה יעלה, זה המחיר של הקיצוץ והוא ייראה מיד.

/** המודל והמאמץ של שלב העיצוב. במקום אחד, כדי שהחזרה תהיה שורה. */
export const STORY_DESIGN = {
  model: "gpt-5.6-luna",
  effort: "medium",
} as const;

/**
 * תקרת ההמתנה לשלב הזה.
 *
 * נמוכה מ-`LLM_TIMEOUT_MS` (120 שנ׳) בכוונה: השלב הזה יושב **בתוך** בקשת
 * היצירה, שנהרגת ב-300 שנ׳, ואחריו עוד רצים הרנדר (25–50 שנ׳), המסגור
 * והוולידציה. שלב טקסט שבולע שתי דקות היה מוציא את כל התקציב מהרנדר.
 * 90 שנ׳ הן הרבה מעל מה שהמודל הזה לוקח בפועל, וכשל כאן ממילא אינו קטלני.
 */
const DESIGN_TIMEOUT_MS = 90_000;

/**
 * ניסיון שני, וזהו.
 *
 * **למה בכלל.** רוב הכשלים כאן מקריים — 429, ניתוק, או JSON שנחתך באמצע —
 * וניסיון שני פותר אותם. עד עכשיו כשל בודד הפיל את השלב כולו והצינור המשיך
 * בפרומפט של שלב אחד, כלומר בדיוק המצב שהשלב הזה נבנה כדי להחליף: מודל תמונה
 * שמתבקש גם לפרש סיפור וגם לצייר אותו.
 *
 * **ולמה רק אחד.** שני כשלים ברצף כבר אינם מקרה, והם הסימן שמשהו שבור —
 * שם התפקיד עובר לתורן האוטומטי ולא לניסיון שלישי. בנוסף, כל ניסיון עולה
 * זמן מתוך תקציב הבקשה, ולקוחה שממתינה שלוש דקות לפני שהרנדר בכלל התחיל היא
 * כשל בפני עצמו.
 */
const DESIGN_ATTEMPTS = 2;

/**
 * תקרה לשלב **כולו**, על פני כל הניסיונות.
 *
 * הניסיון השני אינו מקבל 90 שנ׳ נוספות אוטומטית: הבקשה נהרגת ב-300 שנ׳,
 * ואחרי השלב הזה עוד רצים הרנדר, המסגור והוולידציה. לכן כל ניסיון מקבל את
 * מה שנשאר מהתקציב, ומי שאין לו מספיק זמן להחזיר תשובה אמיתית — לא נשלח.
 */
const DESIGN_BUDGET_MS = 150_000;

/** פחות מזה אין טעם לנסות: התשובה לא תספיק לחזור, והקריאה רק שורפת תקציב. */
const DESIGN_MIN_ATTEMPT_MS = 20_000;

/**
 * כמה כיוונים מודל הטקסט מחזיר — **טווח, לא מספר** (החלטת גל, 16.8).
 *
 * המספר הזה אינו רק "כמה אפשרויות": כל כיוון הוא שורה בתמונה, ומספר השורות
 * הוא מה שקובע את היחס שהמודל מצייר (`storyLayoutFor`). לכן ההחלטה כמה
 * לייצר וההחלטה כמה צר לצייר הן אותה החלטה — ומי שמחזיק אותה הוא מי שקובע
 * את היחסים, כלומר מודל הטקסט.
 *
 * התקרה היא `MAX_CANDIDATES` (6), כמה שהמסך מציג. מעבר לזה היינו ממסגרים
 * ומאמתים מועמדים שאיש לא יראה.
 */
export const DESIGN_COUNT_RANGE: [number, number] = [3, 6];

/** מה שמבקשים כשאין ממה לגזור — הנפילה־לאחור, ומה שהיה קבוע עד 16.8. */
export const DESIGN_COUNT = 3;

/** כיוון עיצוב אחד, כפי ששלב הטקסט מחזיר. */
export interface DesignDirection {
  design_number?: number;
  concept?: string;
  outer_silhouette?: string;
  metal_structure?: string;
  negative_space?: string;
  rhythm_balance?: string;
  manufacturability?: string;
  image_instruction?: string;
  /**
   * היחס בין אורך לרוחב שהכיוון הזה מבקש — **הרוחב של הפריט, בפועל**.
   *
   * במסלול Story הרוחב נגזר מהיחס שצויר, ולכן זה אינו שדה תיאורי אלא המידה
   * היחידה שמודל הטקסט קובע. הוא נשמר ליומן (`RunInputs.askedRatios`) ומועמד
   * מול מה שיצא (`drawnRatio`) — זו כל המדידה.
   */
  length_to_width_ratio?: number;
}

export interface DesignSpec {
  product_type?: string;
  designs: DesignDirection[];
}

/**
 * היחסים שהמפרט ביקש, לפי סדר העיצובים — או `null` כשהמפרט אינו נושא אותם.
 *
 * **חסר אינו כשל.** מפרט בלי יחסים הוא עדיין מפרט טוב, וההרצה כבר שילמה עליו;
 * להפיל אותה בגלל מספר חסר היה שולח אותה למודל התמונה החזק (`STORY_RENDER_FALLBACK`,
 * פי 20–50 בעלות) בשביל ניסוי. לכן `null` פירושו רק שהתצורה נופלת לקבועה ושלא
 * תהיה מדידה בהרצה הזו — והיומן מראה בדיוק את זה.
 *
 * דורש שכל העיצובים יישאו יחס: קבוצה חלקית אינה מרכז שאפשר לתכנן לפיו, והיא
 * גם לא הייתה ניתנת להצמדה מול מה שיצא.
 */
export function askedRatiosOf(spec: DesignSpec): number[] | null {
  const out = spec.designs.map((d) => Number(d.length_to_width_ratio));
  return out.every((n) => Number.isFinite(n) && n > 0) ? out : null;
}

export interface DesignStageResult {
  /** ה-JSON כפי שהמודל החזיר אותו, אחרי ניקוי גדרות markdown. זה מה שנכנס
   *  לפרומפט של מודל התמונה, וזה מה שנשמר ביומן. */
  json: string;
  spec: DesignSpec;
  /** מה שנשלח למודל הטקסט בפועל — ההודעה המערכתית והפרומפט המלא, אחרי
   *  שהתבניות הוחלפו. ראה `DesignStageOutcome`. */
  sent: DesignStageSent;
  /** כמה זמן השלב לקח. ליומן — הוא נוסף לזמן שהלקוחה ממתינה. */
  ms: number;
  /**
   * מה השלב עלה. `null` = הספק לא דיווח.
   *
   * הוא נמדד ולא מוערך משתי סיבות. הראשונה: המודל הזה חושב, וטוקני החשיבה
   * מחויבים כפלט ואינם נראים ב-JSON שחוזר — כלומר האומדן שבראש הקובץ נגזר
   * ממה שרואים, שהוא בדיוק החלק הלא-נכון להסתכל עליו. השנייה: אחרי שנמדד גם
   * שלב התמונה, זה השדה היחיד שחסר כדי שסכום ההרצה יהיה מספר ולא הערכה.
   */
  usage: LlmUsage | null;
  /** כמה ניסיונות נדרשו. 2 = הראשון נפל והשני תפס — הרצה תקינה לכל דבר,
   *  אבל כזו שמעידה על ספק מגמגם, וזה נראה ביומן רק אם הוא נספר. */
  attempts: number;
}

/**
 * מה שיצא מכאן אל מודל הטקסט, מילה במילה.
 *
 * **למה זה נשמר ולא נבנה מחדש בקריאה.** הפרומפט הוא תבנית שהסיפור נכנס לתוכה
 * (`buildDesignPrompt`), והתבנית משתנה — היא הידית הראשונה שמושכים כשהתוצאה לא
 * טובה. בנייה מחדש בזמן הצפייה הייתה מציגה את **הנוסח של היום** על הרצה של
 * שבוע שעבר, כלומר בדיוק את הטקסט שהמודל ההוא לא ראה. זו אותה הנמקה שבגללה
 * `render_prompt` נשמר כמו שהוא ולא נגזר מהמאפיינים.
 *
 * ההודעה המערכתית נשמרת לצידו אף שהיא קבועה היום: היא חלק ממה שנשלח, ומחר
 * היא יכולה להשתנות בלי שאיש יזכור שהיא לא הייתה תמיד כזו.
 */
export interface DesignStageSent {
  system: string;
  prompt: string;
}

/** השלב נפל בכל הניסיונות. מה שכתוב כאן הוא מה שנמסר לתורן ולטלגרם. */
export interface DesignStageFailure {
  attempts: number;
  /** מה שנשלח — גם כשלא חזרה תשובה. דווקא כאן זה מה שמסבירים מולו. */
  sent: DesignStageSent;
  /** נוסח הכשל האחרון, לבן־אדם. לא נמסר ללקוחה — היא לא אמורה להרגיש בכלל. */
  reason: string;
  ms: number;
  /** מה שהניסיונות שנפלו עלו בכל זאת. קריאה שפג לה הזמן אחרי שהמודל כבר
   *  חשב מחויבת במלואה, ולכן זה לא אפס. */
  usage: LlmUsage | null;
}

/**
 * מה שיצא מהשלב. `ok: false` אינו "אין מפרט" סתם — הוא אירוע שמפעיל את
 * התורן, את ההתראה בטלגרם ואת המעבר למודל התמונה החזק, ולכן הסיבה נוסעת איתו.
 */
export type DesignStageOutcome =
  | ({ ok: true } & DesignStageResult)
  | ({ ok: false } & DesignStageFailure);

/* ===== שלב 1: הפרומפט ===== */

const DESIGN_SYSTEM = "You are the conceptual jewelry designer for Aperta.";

const DESIGN_PROMPT = `Aperta turns a personal idea, memory, feeling or aesthetic instruction into a piece of jewellery that can actually be made.

Translate the input below into geometric design directions for an image-generation model. You are not drawing — you are deciding what gets drawn.

PRODUCT: "{PRODUCT_TYPE}"   (bracelet or ring)
LENGTH: {LENGTH_MM}
WIDTH: {WIDTH_MM}
INPUT: "{USER_INPUT}"

INTERPRETATION

Translate the idea into form rather than illustration — silhouette, proportion, mass, rhythm, tension, interruption, density, asymmetry, or whatever the idea itself suggests. Unless the user explicitly asks for something literal, don't place recognisable objects, symbols, letters or pictograms on the jewellery. Someone should feel the relationship between the idea and the geometry without being shown a picture of it.

PROPORTION — THE ONE MEASUREMENT YOU DECIDE

The piece is cut flat and then rolled. Its length is fixed by the body it has to fit, so the only dimension you choose is how wide it is, expressed as a length-to-width ratio. A LOW ratio is a WIDE, bold piece. A HIGH ratio is a NARROW, delicate one.

Range for this product: {RATIO_LO} (widest) to {RATIO_HI} (narrowest).

Give every design its own "length_to_width_ratio" inside that range, and spread them across it: at least one clearly narrow, with the widest and the narrowest differing by at least a factor of two.

Choose each proportion because the idea calls for it. The same idea reads differently at different weights, and the person should get to see that. Width also decides what a design can hold: a broad piece can carry structure through its interior, a very narrow one carries it in its edges and its line.

HOW MANY

Return between {COUNT_LO} and {COUNT_HI} designs — as many as you have genuinely distinct directions for, and no more. They should interpret the same input in ways that are structurally different from one another, not variations of one idea.

MAKING

Each design is laser-cut from one flat sheet of 1.5 mm brass and then rolled into shape. Whatever metal remains has to hold together as a single connected piece.

OUTPUT

Return ONLY valid JSON — no markdown, no explanation before or after it — with one object per design:

{
"product_type": "{PRODUCT_TYPE}",
"designs": [
{
"design_number": 1,
"length_to_width_ratio": 0,
"concept": "How the input is translated into form.",
"outer_silhouette": "The complete outer contour.",
"metal_structure": "The major connected areas of remaining metal.",
"negative_space": "The empty space this design uses — internal openings, carving of the outer contour, the space around the piece, or none of these.",
"rhythm_balance": "Movement, symmetry or asymmetry, tension, visual weight.",
"manufacturability": "Why this stays one robust manufacturable piece.",
"image_instruction": "A concise, geometrically precise instruction describing exactly what to draw."
},
{
"design_number": 2,
"length_to_width_ratio": 0,
"concept": "...",
"outer_silhouette": "...",
"metal_structure": "...",
"negative_space": "...",
"rhythm_balance": "...",
"manufacturability": "...",
"image_instruction": "..."
}
]
}

"length_to_width_ratio" must be a plain number, never a string and never a range.

"image_instruction" is the field that matters most. Write it as a literal drawing instruction — what geometry to draw — not as emotional or conceptual language, and never as a request to interpret the story.`;

/**
 * הרוחב שנמסר לשלב העיצוב.
 *
 * במסלול Story הרוחב **אינו** מידה שהוזמנה — הוא של העיצוב, ונגזר אחר כך מהיחס
 * שצויר (`storyFrameDims`). הערך שברשומה בזמן היצירה הוא עוגן תכנוני בלבד
 * (18 / 6), ומסירתו כאן הייתה מקבעת בדיוק את מה שהמסלול משאיר פתוח. האורך כן
 * נמסר: הוא מדידה, והיחס בין השניים הוא מה שהפרומפט באמת צריך.
 */
const WIDTH_IS_THE_DESIGNS = "not specified — the design decides, within believable proportions";

/** `{TOKEN}` → ערך. פונקציית החלפה ולא מחרוזת: סיפור שמכיל `$&` או `$1` היה
 *  מתפרש כהפניה אחורה ומשכתב את עצמו. */
function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    out = out.replaceAll(`{${token}}`, () => value);
  }
  return out;
}

export function buildDesignPrompt(input: {
  productType: RenderProductType;
  userInput: string;
  lengthMm?: number;
}): string {
  // הטווח נגזר מהאורך ולא קבוע: הקצה הדק נחתך ברוחב המינימלי, וזה מה שהופך
  // את "מינימום 3 מ"מ" מצביטה אחרי הציור לגבול על מה שמבקשים. ראה ratioBandFor.
  const [lo, hi] = ratioBandFor(input.productType, input.lengthMm);
  return fill(DESIGN_PROMPT, {
    PRODUCT_TYPE: input.productType,
    USER_INPUT: input.userInput.trim().replace(/\s+/g, " "),
    LENGTH_MM: input.lengthMm && input.lengthMm > 0
      ? `${Math.round(input.lengthMm * 10) / 10} mm`
      : "not specified",
    WIDTH_MM: WIDTH_IS_THE_DESIGNS,
    RATIO_LO: `1:${lo}`,
    RATIO_HI: `1:${hi}`,
    COUNT_LO: String(DESIGN_COUNT_RANGE[0]),
    COUNT_HI: String(DESIGN_COUNT_RANGE[1]),
  });
}

/* ===== שלב 2: הפרומפט למודל התמונה ===== */

const RENDER_PROMPT = `Create ONE {CANVAS_SHAPE} image containing exactly {COUNT_WORD} flat jewellery blanks.

A jewellery designer has already worked these out. Your job is to execute them — not to reinterpret the idea behind them, and not to invent your own.

DESIGN SPECIFICATION

{STAGE_1_JSON_OUTPUT}

For each design, "image_instruction" is the drawing instruction. "outer_silhouette", "metal_structure", "negative_space" and "rhythm_balance" describe the same geometry in more detail. "concept" is background — it explains the thinking and is not something to draw.

Draw what each specification actually describes, including where it differs from the others.

PROPORTION

Every design carries its own "length_to_width_ratio". A LOW ratio is a WIDE piece; a HIGH ratio is a NARROW one. This is the finished width of the piece, so draw each design at its own ratio.

{PROPORTIONS}

LAYOUT

{ROW_LIST}

One design per horizontal row, centred, evenly spaced, none of them overlapping, each shown whole and unclipped.

The rows are all the same height; the designs inside them are not all the same width. A row is a place to put a design, not a shape to fill — a piece may take up much less of its row than the row allows, and white space around it is correct.

WHAT THESE ARE

Flat blanks as they come off the laser bed, before being rolled into the finished piece. Each one is cut from a single sheet of {THICKNESS_MM} mm brass, so the metal that remains has to hold together as one connected piece.

HOW TO DRAW THEM

Solid black on a pure white background, seen straight from above, perfectly flat: no perspective, no curvature, no depth, no bevel, no texture, no reflection, no gradient, no shadow, no lighting. Openings are the same pure white as the background. Nothing else appears in the image — no text, no labels, no dimensions, no frames, no hands, no background of any kind.

BLACK IS METAL. WHITE IS NOT.`;

/**
 * הפרומפט למודל התמונה, עם מפרט העיצוב בתוכו.
 *
 * `canvas` נמסר ולא מונח: הצורה שהטקסט מבקש חייבת להיות זו שנשלחת ב-`size`,
 * ועד כאן היא הייתה כתובה בתבנית ("ONE landscape / wide image") בזמן שהצד
 * השני שלה נקבע בקוד. שני מקומות לאותה החלטה הם שני מקומות שיכולים להיפרד —
 * וכשהם נפרדים, המודל מצייר לרוחב על תמונה לאורך והפריט יוצא חתוך בקצוות.
 * במסלול Story הערך הוא תמיד `STORY_CANVAS`.
 */
export const buildStagedRenderPrompt = (
  designJson: string,
  canvas: Canvas,
  spec?: DesignSpec | null,
  thicknessMm: number = FAB.defaultThicknessMm,
): string => {
  const designs = spec?.designs ?? [];
  const count = designs.length || DESIGN_COUNT;
  const ratios = spec ? askedRatiosOf(spec) : null;
  return fill(RENDER_PROMPT, {
    STAGE_1_JSON_OUTPUT: designJson.trim(),
    CANVAS_SHAPE: canvas.widthPx < canvas.heightPx ? "portrait / tall" : "landscape / wide",
    COUNT_WORD: numberWord(count).toUpperCase(),
    ROW_LIST: rowList(count),
    PROPORTIONS: proportionLines(ratios),
    THICKNESS_MM: String(thicknessMm),
  });
};

/** ‏"DESIGN 1 — top row / DESIGN 2 — second row / … / DESIGN n — bottom row". */
function rowList(count: number): string {
  const ordinal = ["", "", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  return Array.from({ length: count }, (_, i) => {
    const place = i === 0 ? "top row"
      : i === count - 1 ? "bottom row"
        : `${ordinal[i + 1] ?? `row ${i + 1}`} row from the top`;
    return `DESIGN ${i + 1} — ${place}`;
  }).join("\n");
}

/**
 * מה שנאמר למודל התמונה על היחסים — **המספר וההשוואה גם יחד**.
 *
 * שניהם, ולא אחד מהם, כי הם עושים שני דברים שונים. המספר הוא מה שנמדד אחר כך
 * מול `drawnRatio`, וזו כל נקודת הניסוי. ההשוואה ("הצר ביותר הוא כשליש מרוחב
 * הרחב ביותר") היא מה שיש סיכוי שיפעל: היא מנוסחת בתוך התמונה, ומודל תמונה
 * יכול להעמיד שני פריטים באותו קנבס זה מול זה. מספר מוחלט הוא הפשטה שהוא
 * מתרגם רע — נמדד על 45 הרצות (panels.ts): ביקשו 16 וחזר 8.3.
 *
 * ריק כשאין יחסים במפרט: אז נשאר מה שהפרומפט ממילא אומר, בלי מספרים מומצאים.
 */
function proportionLines(ratios: number[] | null): string {
  if (!ratios?.length) return "";
  const lines = ratios.map(
    (r, i) => `- DESIGN ${i + 1}: length-to-width ratio 1:${Math.round(r * 10) / 10}`,
  );
  const hi = Math.max(...ratios);
  const lo = Math.min(...ratios);
  if (hi / lo >= 1.2) {
    const widest = ratios.indexOf(lo) + 1;
    const narrowest = ratios.indexOf(hi) + 1;
    const factor = Math.round((hi / lo) * 10) / 10;
    lines.push(
      "",
      `DESIGN ${narrowest} is the narrowest and DESIGN ${widest} is the widest: ` +
        `DESIGN ${narrowest} must be drawn about ${factor} times thinner than DESIGN ${widest}. ` +
        "Compare them against each other inside the image and make that difference plainly visible.",
    );
  }
  return lines.join("\n");
}

/* ===== ההרצה ===== */

/**
 * גדר markdown סביב ה-JSON. הפרומפט מבקש במפורש "No markdown", ומודלים
 * עוטפים בכל זאת — וזו לא סיבה להפיל הרצה ששולם עליה.
 */
function unfence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * המפרט, אם הוא שמיש. `null` על כל דבר אחר.
 *
 * הבדיקה היא על מה שמודל התמונה באמת קורא: מספר כיוונים בטווח המותר, ולכל
 * אחד `image_instruction` שאינו ריק. מפרט עם שדה חסר היה מייצר תמונה שבה
 * שורה אחת מומצאת — גרוע יותר מלוותר על השלב כולו.
 *
 * **המספר הוא טווח ולא קבוע** מאז שמודל הטקסט בוחר אותו (`DESIGN_COUNT_RANGE`).
 * מה שנאכף כאן הוא הטווח בלבד; המספר עצמו נמסר הלאה, והוא זה שקובע גם את
 * מספר השורות בתמונה וגם את היחס שהתא מושך אליו (`storyLayoutFor`).
 *
 * **היחס אינו תנאי קבילות.** מפרט בלי `length_to_width_ratio` הוא עדיין מפרט
 * טוב, וההרצה כבר שילמה עליו — ראה `askedRatiosOf`.
 */
export function parseDesignSpec(raw: string): { json: string; spec: DesignSpec } | null {
  const json = unfence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const designs = (parsed as DesignSpec).designs;
  const [lo, hi] = DESIGN_COUNT_RANGE;
  if (!Array.isArray(designs) || designs.length < lo || designs.length > hi) return null;
  const usable = designs.every(
    (d) => d && typeof d === "object" && typeof d.image_instruction === "string"
      && d.image_instruction.trim().length > 0,
  );
  if (!usable) return null;
  return { json, spec: parsed as DesignSpec };
}

/**
 * שלב העיצוב, מקצה לקצה — עם ניסיון שני.
 *
 * **מה נחשב כשל.** גם חריגה (429, ניתוק, פסק זמן) וגם תשובה שאי אפשר לקרוא.
 * השנייה נראית כמו הצלחה מבחוץ אבל היא בדיוק אותו דבר מבחינת הקורא: אין מפרט.
 * שתיהן נובעות מאותה נדנוד אקראי, ושתיהן נפתרות באותו ניסיון חוזר.
 *
 * **הכשל אינו נזרק.** היצירה ממשיכה — עם מודל תמונה חזק יותר, שזה מה שהקורא
 * עושה עם `ok: false`. הלקוחה לא אמורה להרגיש בכלל.
 */
export async function runDesignStage(input: {
  productType: RenderProductType;
  userInput: string;
  lengthMm?: number;
}): Promise<DesignStageOutcome> {
  const startedAt = Date.now();
  const userText = buildDesignPrompt(input);
  const sent: DesignStageSent = { system: DESIGN_SYSTEM, prompt: userText };
  let usage: LlmUsage | null = null;
  let reason = "";
  let attempts = 0;

  for (let attempt = 1; attempt <= DESIGN_ATTEMPTS; attempt++) {
    // כל ניסיון מקבל את מה שנשאר מהתקציב ולא 90 שנ׳ קבועות. ניסיון שאין לו
    // זמן להחזיר תשובה אמיתית לא נשלח — הוא רק היה שורף את מה שנשאר לרנדר.
    const left = DESIGN_BUDGET_MS - (Date.now() - startedAt);
    if (left < DESIGN_MIN_ATTEMPT_MS) {
      if (!reason) reason = "design stage budget exhausted before the first attempt";
      break;
    }
    attempts = attempt;
    try {
      const answer = await askOpenAi({
        system: DESIGN_SYSTEM,
        userText,
        model: STORY_DESIGN.model,
        reasoningEffort: STORY_DESIGN.effort,
        timeoutMs: Math.min(DESIGN_TIMEOUT_MS, left),
      });
      // מה שנצרך נצבר לפני הבדיקה: ניסיון שהחזיר JSON פסול שולם עליו במלואו,
      // והוא בדיוק הניסיון שאסור שייעלם מהחשבון.
      usage = addLlmUsage(usage, answer.usage);
      const parsed = parseDesignSpec(answer.text);
      if (parsed) return { ok: true, ...parsed, sent, ms: Date.now() - startedAt, usage, attempts };
      reason = `unusable output: ${answer.text.slice(0, 200).replace(/\s+/g, " ")}`;
      console.error(`story design stage attempt ${attempt}: ${reason}`);
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
      console.error(`story design stage attempt ${attempt} failed:`, reason);
    }
  }

  return { ok: false, attempts, reason, sent, ms: Date.now() - startedAt, usage };
}
