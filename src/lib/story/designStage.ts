import { askOpenAi } from "@/lib/llm/openai";
import { addLlmUsage, type LlmUsage } from "@/lib/llm/core";
import type { RenderProductType } from "@/lib/llm/imagegen";
import type { Canvas } from "@/lib/render/canvas";
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

const DESIGN_PROMPT = `Aperta transforms a user's personal idea, memory, feeling, story, or aesthetic instruction into a physically manufacturable piece of jewelry.

Your job is NOT to generate an image.

Your job is to translate the user's input into a set of strong, clearly different, product-specific geometric design directions that will be passed directly to an image-generation model.

INPUT

PRODUCT TYPE:
"{PRODUCT_TYPE}"

Allowed values:

- bracelet
- ring

USER INPUT:
"{USER_INPUT}"

OPTIONAL PRODUCT DIMENSIONS:
Length: {LENGTH_MM}
Width: {WIDTH_MM}

If dimensions are unavailable, use believable proportions for the selected product.

---

PROPORTION — THE ONE MEASUREMENT YOU DECIDE

The piece is cut from a flat strip and then rolled. Its length is fixed by the
body it has to fit, so the ONLY dimension you control is how wide it is — and
you express that as a length-to-width ratio.

A LOW ratio means a WIDE, bold piece. A HIGH ratio means a NARROW, delicate one.

Allowed range for this product: {RATIO_LO} (widest) to {RATIO_HI} (narrowest).

Assign every design its own "length_to_width_ratio" inside that range.

These ratios must be SPREAD ACROSS THE RANGE, not clustered:

- at least one design must be clearly NARROW — in the upper third of the range
- at least one design must be clearly WIDER than the narrowest one
- the widest and the narrowest must differ by at least a factor of two

Choose the proportion because the idea calls for it, not to satisfy the rule:
a dense, insistent idea may want mass; a quiet or fragile one may want a thin
line. The spread exists because the same story genuinely reads differently at
different weights, and the person should get to see that.

HOW MANY DESIGNS

You also choose how many designs to return, between {COUNT_LO} and {COUNT_HI}.

Return more when the ideas you are proposing are narrow, and fewer when they
are wide: narrow pieces sit next to each other comfortably, wide ones need the
room. Return more only when you genuinely have that many distinct directions —
{COUNT_LO} strong ones beat {COUNT_HI} where three are padding.

---

CORE INTERPRETATION PRINCIPLE

Interpret the user's input as a creative source, not as an illustration brief.

Unless the user explicitly requests literal imagery, do NOT place recognizable objects, symbols, scenery, icons, words, letters, or pictograms from the story onto the jewelry.

Instead translate the idea into FORM.

Possible formal variables include:

- outer silhouette
- proportion
- mass
- negative space
- sharpness versus softness
- symmetry versus asymmetry
- repetition
- interruption
- rhythm
- tension
- movement
- density
- openness
- compression
- visual weight
- directional flow

The goal is for someone to feel a relationship between the user's idea and the geometry without the jewelry becoming a literal illustration.

---

MANUFACTURING SYSTEM

Every design must be physically manufacturable from ONE single flat sheet of 1.5 mm brass.

Allowed manufacturing operations:

1. laser cutting
2. rolling / bending into the final jewelry form
3. normal finishing

Nothing else.

Therefore:

- the entire design must be one continuous connected piece
- no soldering
- no welding
- no added parts
- no stones
- no chains
- no hinges
- no clasps
- no layered pieces
- no floating elements
- no disconnected islands
- no overlapping geometry

Avoid:

- hair-thin bridges
- fragile connections
- tiny holes
- micro-detail
- decorative filigree
- random perforation patterns
- geometry that would become weak after laser cutting
- features that would be unrealistic in 1.5 mm brass

Think about BLACK as metal that remains and WHITE as material removed by laser.

The remaining metal itself must create the design.

Do NOT default to a rectangular strip with decorative holes cut into it.

The outer silhouette is an important design surface and should participate in the concept whenever appropriate.

---

PRODUCT-SPECIFIC DESIGN RULES

IF PRODUCT TYPE = "bracelet":

Design OPEN CUFF BRACELET flat blanks before rolling.

The flat geometry must be specifically designed for a cuff bracelet.

It must:

- have a long horizontal proportion
- have length clearly much greater than width
- remain suitable for rolling around a wrist
- maintain sufficient continuous structure along its length
- use the long format as part of the composition
- allow substantial, elongated negative spaces where appropriate
- use robust bridges and connections

The outer edges may taper, expand, contract, step, curve, angle or become asymmetric.

Do NOT simply create a rectangular band containing a central decorative motif.

The design should work from end to end.

IF PRODUCT TYPE = "ring":

Design OPEN-ENDED RING flat blanks before rolling.

The geometry must be specifically designed for a ring and NOT be a bracelet design scaled down.

It must:

- use compact believable ring proportions
- remain suitable for rolling around a finger
- remain visually readable at small scale
- use fewer and stronger geometric gestures
- avoid excessive internal cutting
- maintain robust connections appropriate to the small physical size
- use negative space selectively

Concentrate the concept into one or two strong structural gestures rather than many small details.

The ends and overall geometry must remain believable after forming into an open-ended wearable ring.

---

DESIGN DIVERSITY

Create between {COUNT_LO} and {COUNT_HI} design directions.

They must all interpret the SAME user input and belong to a coherent Aperta design language, but they must be structurally different.

Do NOT create one design and make small variations of it.

The directions should differ meaningfully in several of these:

- proportion — how wide or narrow the piece is (see above; this is a real difference, not a detail)

- outer silhouette
- distribution of metal
- negative-space strategy
- symmetry/asymmetry
- rhythm
- visual weight
- directional movement
- density
- composition

Whenever the user's input contains an internal contrast — for example strength and sensitivity, order and freedom, heaviness and lightness — do not merely divide the jewelry into two literal halves.

Explore more sophisticated relationships such as tension, interruption, gradual transition, containment, contrast between outer contour and internal void, or interaction between different geometric behaviors.

---

DESIGN QUALITY

Each direction should have ONE clear visual idea.

Prefer:

- large intentional gestures
- memorable silhouettes
- controlled negative space
- strong composition
- restrained complexity

Avoid:

- generic decoration
- arbitrary holes
- generic waves
- generic geometric patterns
- repetitive ornament without conceptual purpose

Every opening, edge and change of direction should contribute either to the concept, structure, or both.

Before finalizing each design, mentally verify:

1. Is every black region connected?
2. Could this realistically be laser-cut from one sheet?
3. Could the resulting blank realistically be rolled into the requested product?
4. Are the connections robust?
5. Is this clearly different from the other options?
6. Does the geometry actually express the user's input?
7. Is its "length_to_width_ratio" inside the allowed range, and does the set as a whole spread across that range rather than cluster?
8. Does the geometry you described actually fit that width? A narrow piece cannot carry the detail a wide one can.

If not, revise it before producing the output.

---

OUTPUT

Return ONLY valid JSON.

No markdown.
No explanation before or after the JSON.

Use exactly this structure, with one object per design:

{
"product_type": "{PRODUCT_TYPE}",
"designs": [
{
"design_number": 1,
"length_to_width_ratio": 0,
"concept": "Short explanation of how the user's input is translated into form.",
"outer_silhouette": "Concrete description of the complete outer contour.",
"metal_structure": "Concrete description of the major connected areas of remaining metal.",
"negative_space": "Concrete description of the major laser-cut openings.",
"rhythm_balance": "Concrete description of movement, symmetry/asymmetry, tension and visual weight.",
"manufacturability": "Brief explanation of why the design remains one robust manufacturable piece.",
"image_instruction": "A concise but geometrically precise instruction describing exactly what the image model should draw."
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

IMPORTANT:

"length_to_width_ratio" must be a plain number, never a string and never a range.

The "image_instruction" fields are the most important output.

Write them as literal geometric drawing instructions.

Do not use emotional or conceptual language inside "image_instruction".

Do not ask the image model to interpret the user's story.

Describe WHAT GEOMETRY TO DRAW.`;

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

const RENDER_PROMPT = `Create ONE clean product-design image for Aperta containing exactly {COUNT_WORD} different manufacturable jewelry flat blanks.

The jewelry designs have already been developed by a separate jewelry-design model.

DO NOT reinterpret the original user story.
DO NOT invent new designs.

Your task is to visually execute the supplied design directions.

---

DESIGN SPECIFICATION FROM THE JEWELRY DESIGNER

{STAGE_1_JSON_OUTPUT}

---

HOW TO USE THE DESIGN SPECIFICATION

There are exactly {COUNT_WORD} designs in the supplied specification.

Render all of them.

For each design:

The "image_instruction" field is the PRIMARY geometric drawing instruction.

Use:

- "outer_silhouette"
- "metal_structure"
- "negative_space"
- "rhythm_balance"

as supporting geometric context.

The "concept" field explains the reasoning but should NOT cause you to add literal symbols or imagery.

Do not replace the specified geometry with a simpler generic design.

The designs must remain visibly and structurally different from one another.

---

PROPORTION IS PART OF THE DESIGN — DO NOT NORMALIZE IT

Each design carries a "length_to_width_ratio". This is the single most
important number in the specification: it is the actual width of the finished
piece, not a stylistic hint.

A LOW ratio is a WIDE piece. A HIGH ratio is a NARROW piece.

{PROPORTIONS}

Draw each design at its OWN ratio. Do NOT give them a common width, do NOT
average them, and do NOT let the shape of the row decide the width for you.
The difference in width between these designs must be obvious at a glance —
someone looking at the image should immediately see that some pieces are
broad and others are slender.

Each piece may be shorter than the full width of the image if that is what its
own ratio requires. Empty white space around a piece is correct and expected.

---

PRODUCT TYPE IS CRITICAL

Read "product_type" from the supplied JSON.

IF product_type = "bracelet":

Show exactly {COUNT_WORD} OPEN CUFF BRACELET FLAT BLANKS.

These are NOT finished curved bracelets.

They are the flat unbent pieces immediately after laser cutting and before rolling.

Each blank must have believable cuff geometry:

- long horizontal geometry, laid out along the width of its row
- suitable for later rolling around a wrist
- as wide or as narrow as its own "length_to_width_ratio" says, and no other width

Do not shorten them into plaques.

Do not show curved or perspective views.

IF product_type = "ring":

Show exactly {COUNT_WORD} OPEN-ENDED RING FLAT BLANKS.

These are NOT finished circular rings.

They are the flat unbent pieces immediately after laser cutting and before rolling.

A ring blank is a short strip: it wraps a finger, not a wrist.

Its width, however, comes from its own "length_to_width_ratio" and from nothing
else. A ring blank is NOT automatically a stubby rectangle — at a high ratio it
is a fine band, and at a low ratio it is a broad one. Draw what the number says.

Do NOT show circular finished rings.

---

MANUFACTURING CONSTRAINTS

Every design represents one single piece laser-cut from 1.5 mm brass.

BLACK = METAL THAT REMAINS.

WHITE = MATERIAL REMOVED BY LASER.

For every design:

- all black metal must form one continuous connected piece
- no disconnected black islands
- no floating elements
- no overlapping pieces
- no soldered structures
- no layered structures
- no hair-thin bridges
- no fragile connections
- no tiny holes
- no filigree
- no micro-detail
- no random decorative perforations

The result must look physically plausible for laser cutting and later rolling / bending.

---

CRITICAL DESIGN RULE

DO NOT automatically create a rectangular strip and place decorative holes inside it.

The remaining black metal IS the design.

Follow the specified outer silhouette.

If the supplied design direction describes tapering, asymmetry, widening, narrowing, angled edges, curved edges, interruptions or other contour changes, SHOW THEM CLEARLY.

Do not normalize the designs into the same outer shape, and do not normalize them into the same width.

The options must differ structurally, not merely by having different internal cutouts.

---

IMAGE COMPOSITION

Create ONE {CANVAS_SHAPE} image.

Arrange exactly {COUNT_WORD} separate flat jewelry blanks, one per horizontal row, in the order given:

{ROW_LIST}

One complete design per horizontal row.

Center each design horizontally.

Space the rows evenly.

Do not overlap them.

Show every design whole and unclipped.

The rows are all the same height, but the designs inside them are NOT all the
same width — each one keeps its own "length_to_width_ratio". A row is a place
to put a design, not a shape to fill.

Do NOT artificially increase the width of narrow jewelry merely to fill the image.

Generous white space is acceptable.

---

STRICT VISUAL STYLE

Pure white background.

Jewelry shown as solid pure black.

Laser-cut openings shown as the same pure white as the background.

Perfectly flat.

Straight overhead orthographic view.

ZERO perspective.
ZERO curvature.
ZERO bending.
ZERO bevel.
ZERO thickness visualization.
ZERO depth.
ZERO texture.
ZERO reflection.
ZERO gradient.
ZERO cast shadow.
ZERO ambient shadow.
ZERO lighting effects.

No hands.
No body.
No tools.
No environment.

No text.
No captions.
No labels.
No dimensions.
No arrows.
No borders.
No frames.
No decorative graphic elements.

The image should look like {COUNT_WORD} precise black vector-like laser-cut silhouettes on a pure white field.

It must NOT look like finished jewelry photography.

---

FINAL CHECK BEFORE GENERATING

Verify visually that:

1. Exactly {COUNT_WORD} designs are present.
2. Each design corresponds to its supplied design direction.
3. All black regions within each design are connected.
4. The designs are clearly different.
5. Each design is drawn at its OWN "length_to_width_ratio" — the widest and the narrowest are obviously different widths, and none of them has been quietly given the same width as the others.
6. The pieces are completely flat and orthographic.
7. The outer silhouettes follow the supplied designs rather than defaulting to identical rectangles.
8. BLACK represents remaining metal and WHITE represents laser-cut removal.
9. No extra visual elements appear.`;

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
