import { askOpenAi } from "@/lib/llm/openai";
import { addLlmUsage, type LlmRequest, type LlmUsage } from "@/lib/llm/core";
import type { RenderProductType } from "@/lib/llm/imagegen";
import type { Canvas } from "@/lib/render/canvas";
import { FAB } from "@/lib/fabrication.config";
import { DIALOGUE_EDIT } from "./mode";
import {
  EDIT_STRATEGIES, describeSpec, hasSpec, nextEditSpec, ratioOf,
  type EditDecision, type EditSpec, type EditStrategy,
} from "./spec";

// המפרט המצטבר וההחלטה חיים ב-`./spec` — טיפוסים ופונקציות טהורות, בלי תלות
// בלקוח ה-LLM, כדי ששכבת ה-DB תוכל לייבא אותם. הם מיוצאים מחדש מכאן כי זו
// נקודת הכניסה של השלב, ומי שקורא לו ממילא צריך את שניהם.
export {
  describeSpec, nextEditSpec, EDIT_SPEC_NONE, hasSpec, runsRespec, coerceEditSpec, ratioOf,
} from "./spec";
export type { EditDecision, EditSpec, EditStrategy, FieldSource, SpecSources } from "./spec";

// dialogue mode — שלב הטקסט שקודם למודל התמונה **בעריכה**.
//
// **מה הבעיה שזה פותר.** זהו אותו כשל שאובחן ותוקן ביצירה, במקום השני שבו הוא
// יושב. היום בקשת שינוי הולכת למודל התמונה כמשפט אחד בעברית —
// `"שינוי באזור ימין: שיהיה פחות בלאגן פה"` (`create/model.ts#buildEditPrompt`)
// — ומודל התמונה מתבקש גם **לפרש** אותו וגם **לצייר** את התוצאה. את הראשון
// הוא עושה רע, ובעברית מדוברת רע במיוחד.
//
// מכאן הפיצול, בתבנית `lib/story/designStage.ts`:
//
//     בקשה בעברית + אזור → [מודל טקסט] → JSON גיאומטרי באנגלית → [מודל תמונה]
//
// **ומאז PROMPT_SPEC §6 — ‏respec הוא ברירת המחדל.** כשיש מפרט מצטבר, כל
// עריכה היא עריכת מפרט: המודל מעדכן את המפרט הסגור, והתמונה נוצרת **מחדש**
// ממנו, בלי תמונת ייחוס (`buildRespecRenderPrompt`). זה הופך את §2.3 של
// DIALOGUE_PLAN — היצירה-מחדש שהייתה שם הווריאנט הניסויי היא עכשיו ברירת
// המחדל, והייחוס נפילה-לאחור. מה שמחזיק "כל השאר נשאר" בלי ייחוס: הסגירה
// של §2 + המקורות של §1.3 — שדות `user` קפואים, וה-respec נוגע רק במה
// שהבקשה ביקשה. עריכת הייחוס נשארת חיה לשני מצבים: מפרט ריק (עיצובים
// מלפני ההזרעה — ראה `runsRespec`) והנפילה-לאחור, ולכן יש כאן **שני נוסחי
// פרומפט**: ‏respec (יש מפרט) וייחוס (אין).
//
// **מה הפלט.** ב-respec — ‏`image_instruction` שהוא הוראה מלאה על הפריט
// כולו כפי שיהיה, `updated_spec` שלם עם מקור לכל שדה, ו-`strategy`. בעריכת
// ייחוס — הוראת דלתא, `preserve[]` (מה שהבקשה לא נגעה בו ולכן חייב לחזור),
// ו-`scope`. ההבחנה place/property נשארת בשני הנוסחים: "פחות בלאגן פה" עם
// צ'יפ "אזור ימין" היא בקשה על השליש הימני, אבל "שיהיה יותר סימטרי" עם אותו
// צ'יפ היא בקשה על הפריט כולו — סימטריה אינה תכונה של שליש.
//
// **המפרט המצטבר** (§2.2 ב-docs/DIALOGUE_PLAN.md). כל סבב מקבל את מה שנקבע
// בסבבים הקודמים ומחזיר אותו מעודכן. זה מה שפותר את הכשל האמיתי של עריכה
// מצטברת: היום סבב 5 אינו יודע מה נקבע בסבב 2, כי כל סבב רואה רק את התמונה
// ואת המשפט האחרון — ולכן "תחזירי את הקצב שהיה בהתחלה" הוא בקשה שאין לה
// לְמה להתייחס. המפרט נוסע ב-`RunInputs` (jsonb), בלי עמודה ובלי מיגרציה.
//
// **כשזה נכשל, העריכה ממשיכה.** מודל טקסט שנפל, פג, או החזיר JSON שאי אפשר
// לקרוא — כולם מחזירים `ok: false`, והצינור נופל ל-`buildEditPrompt` של היום.
// עריכה לא נכשלת בגלל השלב הזה. בדיוק §4.7 ב-STORY_FLOW_PLAN.
//
// **העלות.** שלב הטקסט מוסיף קריאה משלו לכל סבב, וזה מכוון — §2.4 מתקן
// במפורש את הטענה ש"עלות נמוכה יותר לסבב": תמונת הייחוס היא 323 טוקנים מתוך
// ~1,576, כלומר גם ביטול מוחלט שלה חוסך פחות מ-$0.002. **החיסכון הוא במספר
// הסבבים**, וזו גם המטריקה היחידה שהרתמה מודדת (`lib/dialogue/lab.ts`).

/**
 * תקרת ההמתנה לשלב הזה — נמוכה מ-`LLM_TIMEOUT_MS` (120 שנ׳), מאותו נימוק
 * בדיוק כמו ב-`designStage`: השלב יושב **בתוך** בקשת היצירה שנהרגת ב-300 שנ׳,
 * ואחריו עוד רצים הרנדר (11–20 שנ׳ בעריכה), המסגור והוולידציה.
 *
 * 60 שנ׳ ולא 90 כמו ביצירה: הפלט כאן קטן בהרבה — החלטה על פריט קיים, ולא
 * שלושה עד שישה מפרטים מלאים — וההמתנה כאן נמדדת מול סבלנות של לקוחה
 * שכבר ראתה תוצאה וביקשה תיקון קטן, לא של מי שמחכה ליצירה הראשונה.
 */
const EDIT_TIMEOUT_MS = 60_000;

/** ניסיון שני, וזהו. אותו נימוק כמו ב-`designStage`: רוב הכשלים כאן מקריים
 *  (429, ניתוק, JSON שנחתך), ושני כשלים ברצף כבר אינם מקרה. */
const EDIT_ATTEMPTS = 2;

/** תקרה לשלב **כולו**, על פני כל הניסיונות. הניסיון השני אינו מקבל 60 שנ׳
 *  נוספות אוטומטית — הוא מקבל את מה שנשאר. */
const EDIT_BUDGET_MS = 100_000;

/** פחות מזה אין טעם לנסות: התשובה לא תספיק לחזור, והקריאה רק שורפת תקציב. */
const EDIT_MIN_ATTEMPT_MS = 15_000;

/** כמה פריטי `preserve` נמסרים למודל התמונה — בעריכת ייחוס בלבד.
 *  ראה `stagedEditPrompt`. */
export const MAX_PRESERVE = 6;

/** עומק החשיבה, כפי שהספק מקבל אותו. מוגדר כאן כשם כדי שהרתמה תוכל להעביר
 *  אותו הלאה בלי לייבא את `LlmRequest` כולו. */
export type LlmEffort = NonNullable<LlmRequest["reasoningEffort"]>;

/** האזור שהלקוחה סימנה בצ'יפים. אותם ערכים כמו `Region` ב-create/model.ts,
 *  ובכוונה לא מיובאים משם: זה מודול שרת, ו-`model.ts` גורר איתו את מילון
 *  האתר ואת מצב המסע כולו. */
export type EditRegion = "right" | "center" | "left" | "all";

/** הצ'יפ, באנגלית, למודל. `all` אינו אזור אלא היעדר אזור — ולכן הוא נכתב
 *  כך ולא כ-"the whole piece": הפרומפט מבקש מהמודל להכריע על ההיקף בעצמו,
 *  ו"הפריט כולו" ככתוב היה תשובה מוכנה שהוא ימחזר. */
const REGION_HINT: Record<EditRegion, string> = {
  right: "the right-hand third of the piece",
  center: "the middle third of the piece",
  left: "the left-hand third of the piece",
  all: "not specified — the customer did not point at a region",
};

export interface EditStageSent {
  system: string;
  prompt: string;
}

export interface EditStageResult {
  /** ה-JSON כפי שהמודל החזיר, אחרי ניקוי גדרות markdown. ליומן. */
  json: string;
  decision: EditDecision;
  /** המפרט המצטבר אחרי הסבב הזה — מה שייכנס לסבב הבא. */
  spec: EditSpec;
  /** מה שנשלח בפועל. נשמר ולא נבנה מחדש בקריאה, מאותו נימוק כמו
   *  `DesignStageSent`: התבנית היא הידית הראשונה שמושכים, ובנייה מחדש בזמן
   *  הצפייה הייתה מציגה את הנוסח של היום על הרצה של שבוע שעבר. */
  sent: EditStageSent;
  ms: number;
  usage: LlmUsage | null;
  attempts: number;
}

export interface EditStageFailure {
  attempts: number;
  sent: EditStageSent;
  reason: string;
  ms: number;
  /** מה שהניסיונות שנפלו עלו בכל זאת. קריאה שפג לה הזמן אחרי שהמודל כבר
   *  חשב מחויבת במלואה, ולכן זה לא אפס. */
  usage: LlmUsage | null;
}

export type EditStageOutcome =
  | ({ ok: true } & EditStageResult)
  | ({ ok: false } & EditStageFailure);

/* ===== הפרומפט — שני נוסחים ===== */

const EDIT_SYSTEM = "You are the conceptual jewelry designer for Aperta, revising a piece you already designed.";

/**
 * הנוסח של respec — רץ כשיש מפרט מצטבר (‏PROMPT_SPEC §6).
 *
 * ההבדל המהותי מהנוסח השני: אין תמונת ייחוס בהמשך הדרך, ולכן אין `preserve`
 * — השימור יושב במפרט עצמו ("העתק מילה במילה את מה שהבקשה לא נגעה בו"),
 * ו-`image_instruction` היא הוראה **מלאה** שעומדת לבדה. הסגירה של §2 יושבת
 * כאן: מניין מדויק, מידות כיחסים בתוך התמונה (לקח 4 — לא מ"מ), ו"אין" הוא
 * הכרעה ולא שתיקה (לקח 3 — כל שדה בנוסח "…or none").
 */
const EDIT_PROMPT_RESPEC = `A customer is looking at a piece of jewellery we made for her and has asked for one change to it. The piece will be REDRAWN FROM ITS SPECIFICATION: the image model will not see the current image — your updated specification and drawing instruction are everything it gets, and any decision you leave open it will make differently on every run.

You are not drawing, and you are not designing a new piece. You are revising the specification of an existing piece so that what she asked to change changes — and everything else comes back because the specification says so.

PRODUCT: "{PRODUCT_TYPE}"   (bracelet or ring)
LENGTH: {LENGTH_MM}
REGION SHE POINTED AT: {REGION}
HER REQUEST, VERBATIM (Hebrew): "{USER_REQUEST}"

WHAT THE PIECE IS NOW

Each field is tagged with who decided it. [user] — she said or approved it explicitly: frozen, change it only if her request explicitly reaches it. [inferred] — read from her words: stable, adjust it only if her request suggests the reading missed. [chosen] — a designer's call: yours to re-make, but only where her request or a making constraint forces it. An untagged field counts as [inferred].

{CURRENT_SPEC}

READING THE REQUEST

It is written in spoken Hebrew, not a specification: it may be vague ("less of a mess here"), relative ("a bit more like the first one"), emotional ("it should feel calmer"), misspelled, or a fragment. Read what she means, not what she typed.

Two things she says are different in kind, and confusing them is the failure this stage exists to prevent. A request about a PLACE ("the right side is too busy") applies to that place. A request about a PROPERTY of the whole piece ("make it more symmetrical", "calmer", "lighter") applies to the whole piece, whatever region she happened to have selected — symmetry is not a property a third of a piece can have. The region above is what she pointed at; you decide what her sentence actually reaches.

If her request could reasonably mean two different changes, choose the smaller and more reversible of the two, and say what was ambiguous in "needs_clarification".

STRATEGY

Return "strategy": "respec" and proceed — unless her request asks for something this product cannot be. The piece is laser-cut from one flat sheet of metal: openings and the outer contour are its entire language. There is no engraving, no stones, no colour, no texture, no relief. If that is what she asked for, return "strategy": "clarify", put the question for her in "needs_clarification", and write the specification with only the part of her request the medium can honour — unchanged where none of it can be.

WHAT TO RETURN

"updated_spec" is the piece AFTER this change, complete. Copy forward, word for word, every field the change does not touch — identical words redraw the same piece. Where the specification above leaves an axis open, decide it now: "none" (no openings, no repeated elements) is a decision; silence is not. State every count exactly ("seven openings", never "several"), and give sizes as comparisons inside the image ("the band is as narrow as the gap beside it"), never in millimetres.

"sources" tags every field you wrote in "updated_spec": "user" if her request set it explicitly, "inferred" if you read it from her words, "chosen" if you decided because someone must.

"image_instruction" is the field that matters most. Write it in English, as one complete, literal, geometric drawing instruction for the WHOLE piece as it will be after the change — outer contour, metal structure, every opening with its exact count, placement and spacing, both ends. It must stand alone: the model drawing it has never seen the piece.

MAKING

The piece is laser-cut from one flat sheet and rolled. Whatever metal remains has to hold together as a single connected piece, so a change that would sever it, or thin it past cutting, is not the change to make — make the nearest one that survives.

OUTPUT

Return ONLY valid JSON — no markdown, no explanation before or after it:

{
"strategy": "respec",
"scope": "Exactly what part of the piece this change reaches, and why that is what her sentence means.",
"image_instruction": "One complete, geometrically precise instruction describing the whole piece as it will be.",
"needs_clarification": "The question worth asking her, if her request was genuinely ambiguous or outside the medium. Omit this field otherwise.",
"updated_spec": {
"outer_silhouette": "The complete outer contour, described concretely enough to draw — and whether it is a frame that contains the elements, or the elements themselves are the outer edge.",
"metal_structure": "The major connected areas of remaining metal.",
"negative_space": "The empty space the piece uses — internal openings, carving of the outer contour, the space around the piece, or none of these.",
"rhythm_balance": "Movement, rhythm, tension, visual weight.",
"symmetry": "Which symmetry the piece keeps — along its length, around its centre, both, or deliberately none.",
"ends_treatment": "How each of the two ends finishes, concretely — the ends meet on the wrist and are a visible part of the piece.",
"metal_void_balance": "How much of the piece is open against solid, as a share of its area (\\"about a third of the area is open\\") — or that it is fully solid.",
"elements": "Every repeated element the piece carries: its shape, its exact count, its line weight relative to something visible in the piece, its spacing, where it sits, and whether its corners are sharp or rounded — or that the piece has no repeated elements.",
"region_map": "What sits in the right, centre and left thirds of the piece as drawn — or that it reads as one continuous whole.",
"manufacturability": "Why this stays one robust manufacturable piece.",
"length_to_width_ratio": 0,
"sources": {"outer_silhouette": "user"}
}
}

"length_to_width_ratio" must be a plain number — the piece's length divided by its width. Keep the current one unless her request changes the width.

"image_instruction" and every "updated_spec" field must be in English. Write them for a model that will draw the piece from them alone.`;

/**
 * נוסח הייחוס — רץ כשאין מפרט מצטבר: עיצוב מלפני ההזרעה, או שרשרת שנקטעה.
 * ‏respec על מפרט ריק אינו עריכה אלא פריט חדש (ראה `runsRespec`), ולכן כאן
 * התמונה הקיימת נשארת מצורפת וההוראה היא דלתא עליה — המסלול של DIALOGUE_PLAN
 * §2.1 כפי שנבנה, ועכשיו גם הנפילה-לאחור השמורה של §6.
 *
 * ‏`updated_spec` מתבקש גם כאן — הוא מה שמזרים את השרשרת כך שהסבב **הבא**
 * כבר יוכל לרוץ respec — אבל עם רישיון השמטה מפורש: המודל אינו רואה את
 * התמונה, ושדה מומצא היה מצהיר בביטחון על פריט אחר (לקח 3).
 */
const EDIT_PROMPT_REFERENCE = `A customer is looking at a piece of jewellery we made for her and has asked for one change to it. Your job is to turn her request into a precise drawing instruction for an image model that will edit the existing image.

You are not drawing, and you are not designing a new piece. You are deciding exactly what changes and exactly what must not.

PRODUCT: "{PRODUCT_TYPE}"   (bracelet or ring)
LENGTH: {LENGTH_MM}
REGION SHE POINTED AT: {REGION}
HER REQUEST, VERBATIM (Hebrew): "{USER_REQUEST}"

WHAT THE PIECE IS NOW

{CURRENT_SPEC}

READING THE REQUEST

It is written in spoken Hebrew, not a specification: it may be vague ("less of a mess here"), relative ("a bit more like the first one"), emotional ("it should feel calmer"), misspelled, or a fragment. Read what she means, not what she typed.

Two things she says are different in kind, and confusing them is the failure this stage exists to prevent. A request about a PLACE ("the right side is too busy") applies to that place. A request about a PROPERTY of the whole piece ("make it more symmetrical", "calmer", "lighter") applies to the whole piece, whatever region she happened to have selected — symmetry is not a property a third of a piece can have. The region above is what she pointed at; you decide what her sentence actually reaches.

If her request could reasonably mean two different changes, choose the smaller and more reversible of the two, and say what was ambiguous in "needs_clarification".

WHAT TO RETURN

"image_instruction" is the field that matters most. Write it in English, as a literal geometric drawing instruction: what shape changes, where, into what, and by roughly how much. Describe geometry — contour, mass, opening, spacing, thickness, rhythm — not feeling. Never restate her Hebrew in English: "make the right side less busy" is her sentence translated, not an instruction; "on the right-hand third, reduce the cut openings from seven narrow slots to three, each about twice the width, keeping their spacing even" is an instruction.

"preserve" is the other half, and it is what keeps this an edit. List the concrete features of the piece that her request does NOT touch and that must come back unchanged — the outer contour, a particular opening, the rhythm along the rest of the length, whatever the current specification says is there. Between two and {MAX_PRESERVE} items, each one concrete enough to check against the image. Do not list "everything else".

"updated_spec" is the piece's specification as it will be AFTER this change. There is no recorded specification to carry forward, so write only the fields her request and this change establish, and omit — do not invent — the ones you cannot know: an invented field would confidently describe a different piece, and the next round would edit it as if it were true. State counts exactly, and give sizes as comparisons inside the image, never in millimetres. "sources" tags every field you wrote: "user" if her request set it explicitly, "inferred" if you read it from her words, "chosen" if you decided because someone must.

MAKING

The piece is laser-cut from one flat sheet and rolled. Whatever metal remains has to hold together as a single connected piece, so a change that would sever it, or thin it past cutting, is not the change to make — make the nearest one that survives.

OUTPUT

Return ONLY valid JSON — no markdown, no explanation before or after it:

{
"scope": "Exactly what part of the piece this change reaches, and why that is what her sentence means.",
"image_instruction": "A concise, geometrically precise instruction describing exactly what to draw differently.",
"preserve": ["A concrete feature that stays exactly as it is.", "Another one."],
"needs_clarification": "The question worth asking her, if her request was genuinely ambiguous. Omit this field otherwise.",
"updated_spec": {
"outer_silhouette": "The complete outer contour, as it will be after this change.",
"metal_structure": "The major connected areas of remaining metal, as they will be.",
"negative_space": "The empty space the piece uses, as it will be — or none of these.",
"rhythm_balance": "Movement, rhythm, tension, visual weight, as they will be.",
"symmetry": "Which symmetry the piece keeps — along its length, around its centre, both, or deliberately none.",
"ends_treatment": "How each of the two ends finishes, if this change or her request establishes it.",
"metal_void_balance": "How much of the piece is open against solid, as a share of its area — or that it is fully solid.",
"elements": "Every repeated element this change establishes: shape, exact count, relative line weight, spacing, placement, corners — or that the piece has no repeated elements.",
"region_map": "What sits in the right, centre and left thirds of the piece as drawn, if known.",
"manufacturability": "Why this stays one robust manufacturable piece.",
"sources": {"outer_silhouette": "user"}
}
}

"image_instruction" and "preserve" must be in English. Write them for a model that will look at the current image and change only what you name.`;

/** `{TOKEN}` → ערך. פונקציית החלפה ולא מחרוזת: בקשה שמכילה `$&` או `$1` הייתה
 *  מתפרשת כהפניה אחורה ומשכתבת את עצמה. זהה ל-`fill` ב-designStage, ומועתקת
 *  ולא משותפת: זהו מסלול מקביל שמחיקתו היא מחיקת תיקייה. */
function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    out = out.replaceAll(`{${token}}`, () => value);
  }
  return out;
}

export interface EditStageInput {
  productType: RenderProductType;
  /** הבקשה בעברית, כמו שהלקוחה כתבה אותה. **גולמית** — לא `buildEditPrompt`:
   *  זה בדיוק העיבוד שהשלב הזה בא להחליף, וכניסה שלו לכאן הייתה מוסרת למודל
   *  את האזור פעמיים, בשתי שפות, בשני ניסוחים שיכולים לסתור. */
  request: string;
  region?: EditRegion | null;
  /** המפרט המצטבר. `null` בסבב הראשון אחרי יצירה במסלול הרגיל. */
  spec?: EditSpec | null;
  lengthMm?: number;
}

/**
 * הנוסח נבחר לפי מה שיש, לא לפי מה שהוצהר: יש מפרט → ‏respec; אין → ייחוס.
 * זו אותה הכרעה בדיוק ש-`runsRespec` עושה בצינור — הפרומפט והמסירה חייבים
 * להסכים, אחרת המודל עונה על שאלה אחת והתמונה נבנית לפי אחרת.
 */
export function buildEditStagePrompt(input: EditStageInput): string {
  const respec = hasSpec(input.spec);
  return fill(respec ? EDIT_PROMPT_RESPEC : EDIT_PROMPT_REFERENCE, {
    PRODUCT_TYPE: input.productType,
    USER_REQUEST: input.request.trim().replace(/\s+/g, " "),
    REGION: REGION_HINT[input.region ?? "all"],
    LENGTH_MM: input.lengthMm && input.lengthMm > 0
      ? `${Math.round(input.lengthMm * 10) / 10} mm`
      : "not specified",
    // תיוגי המקור נמסרים לפרומפט **התכנון** בלבד — זה המקום שבו ההחלטות
    // מתקבלות. לפרומפט הביצוע (buildRespecRenderPrompt) הם לא מגיעים.
    CURRENT_SPEC: describeSpec(input.spec, { sources: respec }),
    MAX_PRESERVE: String(MAX_PRESERVE),
  });
}

/* ===== מה שנמסר למודל התמונה ===== */

/**
 * הטקסט שמחליף את `buildEditPrompt` בקריאה ל-`buildRenderPrompt(editing=true)`
 * — **בעריכת ייחוס בלבד**. ב-respec אין תמונה מצורפת ואין "CHANGE REQUEST";
 * מה שנמסר הוא פרומפט שלם משלו — ראה `buildRespecRenderPrompt`.
 *
 * **הוא נכנס באותו מקום בדיוק**, ולא כפרמטר נוסף: הפסקה שם ("CHANGE REQUEST
 * (apply only this)" ואחריה פסקת השמירה) היא ניסוח שנמדד, וסדר שני חלקיה הוא
 * הוראה בפני עצמה — קודם מה לעשות, ואז מה לא לגעת בו. מה שמשתנה הוא רק **מה**
 * ממלא את המקום: הוראה גיאומטרית באנגלית במקום משפט בעברית.
 *
 * ה-`preserve` נספח בסוף המשפט ולא כפסקה נפרדת, מאותה סיבה: פסקת השמירה
 * הכללית כבר יושבת שם, והפריטים כאן הם ההשלמה הספציפית שלה — מה שדווקא
 * בעיצוב הזה חייב לחזור. פסקה שנייה על שימור, אחרי הראשונה, הייתה מזיזה את
 * הבקשה עצמה לאמצע.
 */
export function stagedEditPrompt(decision: EditDecision): string {
  const instruction = decision.image_instruction?.trim().replace(/[.\s]+$/, "") ?? "";
  const keep = (decision.preserve ?? [])
    .map((p) => (typeof p === "string" ? p.trim().replace(/[.\s]+$/, "") : ""))
    .filter(Boolean)
    .slice(0, MAX_PRESERVE);
  if (!keep.length) return instruction;
  return `${instruction}. Leave these exactly as they are in the attached image: ${keep.join("; ")}`;
}

/* ===== הפרומפט של respec למודל התמונה ===== */

/** מספר → מילה, לפרומפט. מועתק מ-imagegen ולא משותף — מסלול מקביל. */
const COUNT_WORD: Record<number, string> = {
  1: "ONE", 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX", 7: "SEVEN", 8: "EIGHT",
};
const countWord = (n: number): string => COUNT_WORD[n] ?? String(n);

/**
 * התבנית של respec: יצירה מחדש מהמפרט הסגור, בלי תמונת ייחוס.
 *
 * בתבנית `RENDER_PROMPT` של `designStage` — אותו חוזה מדיום, מילה במילה —
 * אבל פריט **אחד** ולא 3–6 כיוונים: כל השורות הן אותו פריט, מצויר שוב מאותו
 * מפרט. זה היפוך מכוון של משפט השורות ביצירה ("כל שורה עיצוב אחר"): המפרט
 * סגור, מה שנבדל בין השורות הוא רעש ביצוע בלבד (§1.1 ב-PROMPT_SPEC), והוא
 * עצמו מדיד — פיזור בין שורות של אותה קריאה הוא דגימה של רצפת הרעש (§1.4).
 */
const RESPEC_RENDER_PROMPT = `Create ONE {CANVAS_SHAPE} image containing exactly {PIECES_WORD} flat jewellery blanks.

A jewellery designer has revised an existing piece and closed every decision. Your job is to execute the specification — not to reinterpret it, and not to add ideas of your own.

THE PIECE

{INSTRUCTION}

SPECIFICATION

{SPEC}

Draw exactly what the specification describes. Draw the outer contour it specifies, not only what is cut out of it.
{PROPORTION}
LAYOUT

{LAYOUT}

WHAT THESE ARE

Flat blanks as they come off the laser bed, before being rolled into the finished piece. Each one is cut from a single sheet of {THICKNESS_MM} mm brass, so the metal that remains has to hold together as one connected piece.

HOW TO DRAW THEM

Solid black on a pure white background, seen straight from above, perfectly flat: no perspective, no curvature, no depth, no bevel, no texture, no reflection, no gradient, no shadow, no lighting. Openings are the same pure white as the background. Nothing else appears in the image — no text, no labels, no dimensions, no frames, no hands, no background of any kind.

BLACK IS METAL. WHITE IS NOT.`;

/** משפט הפרופורציה — רק כשיש יחס. בלעדיו נשאר מה שהפרומפט ממילא אומר,
 *  בלי מספרים מומצאים (אותה הנמקה כמו `proportionLines` ב-designStage). */
function respecProportion(ratio: number | null): string {
  if (ratio === null) return "";
  const r = Math.round(ratio * 10) / 10;
  return `\nPROPORTION\n\nThe piece's length-to-width ratio is 1:${r}. A LOW ratio is a WIDE piece; a HIGH ratio is a NARROW one. This is the finished width of the piece — draw every copy at exactly this ratio.\n`;
}

/**
 * משפט הפריסה. שלוש צורות, כמו ב-`buildRenderPrompt` — פריט יחיד, טור,
 * רשת — אבל כולן אומרות את אותו דבר אחד: כל עותק הוא **אותו פריט**, לא
 * וריאציה. פס לבן רצוף בין שורות הוא חוזה הפריסה שנמדד (ראה designStage) —
 * הוא מה ש-`split_rows` מחפש, ובלעדיו עותקים שצוירו אינם מגיעים ללקוחה.
 */
function respecLayout(rows: number, cols: number): string {
  const pieces = rows * cols;
  if (pieces <= 1) {
    return "The image contains this one piece. Show it whole and unclipped, centred, with plain white all around it.";
  }
  const same =
    "Every copy is the same piece — the specification above, drawn again — not a variation of it and not an alternative to it.";
  const band =
    "Leave a clear, unbroken horizontal band of pure white between every two copies, running the full width of the image. No part of one copy may reach into that band.";
  if (cols <= 1) {
    return (
      `The image contains exactly ${countWord(pieces)} copies of that one piece, stacked one above another as ` +
      `${countWord(rows)} evenly spaced horizontal rows, with plain white space between them and no line, frame, ` +
      `divider or caption of any kind. ${same} Show every copy whole and unclipped, its bounding box spanning ` +
      `almost the full width of the image with a thin white margin at each end.\n\n${band}`
    );
  }
  return (
    `The image contains exactly ${countWord(pieces)} copies of that one piece, laid out as a grid of ` +
    `${countWord(rows)} evenly spaced horizontal rows by ${countWord(cols)} evenly spaced vertical columns, ` +
    `with plain white space between every copy and no line, frame, divider, grid line or caption of any kind. ` +
    `${same} Each copy's bounding box spans almost the full width of its own column with a thin white margin at ` +
    `each end — a copy never runs across the full width of the image. Show every copy whole and unclipped.`
  );
}

/**
 * הפרומפט למודל התמונה ב-respec — התמונה נוצרת מחדש מהמפרט, בלי ייחוס.
 *
 * `canvas` נמסר ולא מונח, מאותו נימוק כמו `buildStagedRenderPrompt`: הצורה
 * שהטקסט מבקש חייבת להיות זו שנשלחת ב-`size`, ושני מקומות לאותה החלטה הם
 * שני מקומות שיכולים להיפרד.
 *
 * `fallbackRatio` — היחס של הפריט הנערך (אורך/רוחב מהרשומה), למפרט שעדיין
 * אינו נושא יחס משלו: מפרטים מסבבים שלפני ההרחבה. עדיף יחס מדוד של הפריט
 * האמיתי על היעדר הכרעה — ציר פתוח הוא קובייה (§1.1).
 */
export function buildRespecRenderPrompt(input: {
  spec: EditSpec;
  decision: EditDecision;
  canvas: Canvas;
  rows?: number;
  cols?: number;
  thicknessMm?: number;
  fallbackRatio?: number | null;
}): string {
  const rows = Math.max(1, input.rows ?? 1);
  const cols = Math.max(1, input.cols ?? 1);
  const fallback = Number(input.fallbackRatio);
  const ratio = ratioOf(input.spec) ?? (Number.isFinite(fallback) && fallback > 0 ? fallback : null);
  return fill(RESPEC_RENDER_PROMPT, {
    CANVAS_SHAPE: input.canvas.widthPx < input.canvas.heightPx ? "portrait / tall" : "landscape / wide",
    PIECES_WORD: countWord(rows * cols),
    INSTRUCTION: input.decision.image_instruction?.trim() ?? "",
    // בלי תיוגי מקור: בדרך למודל התמונה כל השדות שווים — סגורים (§1.3),
    // ותיוג כאן היה אוצר-מילים בפרומפט הביצוע, שכבת האיסור של §2.4.
    SPEC: describeSpec(input.spec),
    PROPORTION: respecProportion(ratio),
    LAYOUT: respecLayout(rows, cols),
    THICKNESS_MM: String(input.thicknessMm ?? FAB.defaultThicknessMm),
  });
}

/* ===== הפענוח ===== */

/** גדר markdown סביב ה-JSON. הפרומפט מבקש במפורש "No markdown", ומודלים
 *  עוטפים בכל זאת — וזו לא סיבה להפיל סבב ששולם עליו. */
function unfence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * ההחלטה, אם היא שמישה. `null` על כל דבר אחר.
 *
 * **תנאי הקבילות הוא `image_instruction` בלבד**, ובכוונה. הוא השדה היחיד
 * שבלעדיו אין מה למסור למודל התמונה; `preserve` ריק הוא מצב תקין (בקשה
 * שנוגעת בפריט כולו), `scope` הוא תיאור, ו-`updated_spec` חסר פירושו שהמפרט
 * הקודם ממשיך כמו שהוא. פסילה על אחד מהם הייתה שולחת סבב שלם לנפילה־לאחור
 * בגלל שדה שהצינור ממילא יודע לחיות בלעדיו — אותה הנמקה כמו
 * `length_to_width_ratio` ב-`askedRatiosOf`.
 *
 * **`preserve` שאינו מערך של מחרוזות מנוקה ולא פוסל**, מאותו נימוק: מודל
 * שהחזיר מחרוזת אחת במקום מערך אמר משהו שמיש בצורה הלא נכונה.
 *
 * **`strategy` שאינו אחד משלושת הערכים נקרא כחסר** — כלומר respec, ברירת
 * המחדל של §6. מי שמכריע אם הייחוס באמת נשלח הוא `runsRespec`, לא המחרוזת.
 */
export function parseEditDecision(raw: string): { json: string; decision: EditDecision } | null {
  const json = unfence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const box = parsed as Record<string, unknown>;
  const instruction = typeof box.image_instruction === "string" ? box.image_instruction.trim() : "";
  if (!instruction) return null;

  const preserve = (Array.isArray(box.preserve) ? box.preserve : [box.preserve])
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  const strategy = EDIT_STRATEGIES.find((s): s is EditStrategy => s === box.strategy);
  const spec = box.updated_spec;
  const decision: EditDecision = {
    image_instruction: instruction,
    preserve,
    ...(strategy ? { strategy } : {}),
    ...(typeof box.scope === "string" && box.scope.trim() ? { scope: box.scope.trim() } : {}),
    ...(typeof box.needs_clarification === "string" && box.needs_clarification.trim()
      ? { needs_clarification: box.needs_clarification.trim() }
      : {}),
    ...(spec && typeof spec === "object" && !Array.isArray(spec)
      ? { updated_spec: spec as EditSpec }
      : {}),
  };
  return { json, decision };
}

/* ===== ההרצה ===== */

/**
 * שלב הטקסט של העריכה, מקצה לקצה — עם ניסיון שני.
 *
 * **מה נחשב כשל.** גם חריגה (429, ניתוק, פסק זמן) וגם תשובה שאי אפשר לקרוא.
 * השנייה נראית כמו הצלחה מבחוץ אבל היא אותו דבר מבחינת הקורא: אין הוראה.
 *
 * **הכשל אינו נזרק.** הקורא מקבל `ok: false` ונופל ל-`buildEditPrompt` של
 * היום — כלומר בדיוק המסלול שרץ עד עכשיו. הלקוחה לא אמורה להרגיש בכלל.
 *
 * `model` ו-`effort` הם פרמטרים ולא קבועים: הרתמה של A0 מריצה כאן מועמדים
 * מ-§5.4 זה מול זה, ובלעדיהם היא הייתה דורשת שכפול של הפונקציה.
 */
export async function runEditStage(
  input: EditStageInput & { model?: string; effort?: LlmEffort },
): Promise<EditStageOutcome> {
  const startedAt = Date.now();
  const userText = buildEditStagePrompt(input);
  const sent: EditStageSent = { system: EDIT_SYSTEM, prompt: userText };
  let usage: LlmUsage | null = null;
  let reason = "";
  let attempts = 0;

  for (let attempt = 1; attempt <= EDIT_ATTEMPTS; attempt++) {
    // כל ניסיון מקבל את מה שנשאר מהתקציב ולא 60 שנ׳ קבועות. ניסיון שאין לו
    // זמן להחזיר תשובה אמיתית לא נשלח — הוא רק היה שורף את מה שנשאר לרנדר.
    const left = EDIT_BUDGET_MS - (Date.now() - startedAt);
    if (left < EDIT_MIN_ATTEMPT_MS) {
      if (!reason) reason = "edit stage budget exhausted before the first attempt";
      break;
    }
    attempts = attempt;
    try {
      const answer = await askOpenAi({
        system: EDIT_SYSTEM,
        userText,
        model: input.model || DIALOGUE_EDIT.model,
        reasoningEffort: input.effort || DIALOGUE_EDIT.effort,
        timeoutMs: Math.min(EDIT_TIMEOUT_MS, left),
      });
      // מה שנצרך נצבר לפני הבדיקה: ניסיון שהחזיר JSON פסול שולם עליו במלואו,
      // והוא בדיוק הניסיון שאסור שייעלם מהחשבון.
      usage = addLlmUsage(usage, answer.usage);
      const parsed = parseEditDecision(answer.text);
      if (parsed) {
        return {
          ok: true,
          json: parsed.json,
          decision: parsed.decision,
          spec: nextEditSpec(input.spec, parsed.decision),
          sent,
          ms: Date.now() - startedAt,
          usage,
          attempts,
        };
      }
      reason = `unusable output: ${answer.text.slice(0, 200).replace(/\s+/g, " ")}`;
      console.error(`dialogue edit stage attempt ${attempt}: ${reason}`);
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
      console.error(`dialogue edit stage attempt ${attempt} failed:`, reason);
    }
  }

  return { ok: false, attempts, reason, sent, ms: Date.now() - startedAt, usage };
}
