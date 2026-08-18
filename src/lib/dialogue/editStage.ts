import { askOpenAi } from "@/lib/llm/openai";
import { addLlmUsage, type LlmRequest, type LlmUsage } from "@/lib/llm/core";
import type { RenderProductType } from "@/lib/llm/imagegen";
import { DIALOGUE_EDIT } from "./mode";
import { describeSpec, nextEditSpec, type EditDecision, type EditSpec } from "./spec";

// המפרט המצטבר וההחלטה חיים ב-`./spec` — טיפוסים ופונקציות טהורות, בלי תלות
// בלקוח ה-LLM, כדי ששכבת ה-DB תוכל לייבא אותם. הם מיוצאים מחדש מכאן כי זו
// נקודת הכניסה של השלב, ומי שקורא לו ממילא צריך את שניהם.
export { describeSpec, nextEditSpec, EDIT_SPEC_NONE, hasSpec } from "./spec";
export type { EditDecision, EditSpec } from "./spec";

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
// **ומה שונה כאן מ-`designStage`, ולמה.** שם הקלט הוא סיפור והפלט הוא שלושה
// כיוונים חדשים. כאן כבר יש פריט על המסך, והשאלה אינה "מה לצייר" אלא **מה
// לשנות ומה לא לגעת בו**. לכן הפלט הוא שלושה שדות ולא מפרט מלא:
//
//  - `image_instruction` — מה לצייר אחרת, גיאומטרית ובאנגלית.
//  - `preserve` — מה שהבקשה **לא** נגעה בו ולכן חייב להישאר. זה הצד שאין לו
//    מקבילה ביצירה, והוא מה שהופך "פחות בלאגן פה" לשינוי מקומי במקום לעיצוב
//    חדש שבמקרה דומה.
//  - `scope` — איפה. הצ'יפ שהלקוחה בחרה הוא רמז ולא גזירה: "פחות בלאגן פה"
//    עם צ'יפ "אזור ימין" הוא בקשה על השליש הימני, אבל "שיהיה יותר סימטרי"
//    עם אותו צ'יפ הוא בקשה על הפריט כולו — סימטריה אינה תכונה של שליש.
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
 * 60 שנ׳ ולא 90 כמו ביצירה: הפלט כאן קטן בהרבה — שלושה שדות על פריט קיים,
 * ולא שלושה עד שישה מפרטים מלאים — וההמתנה כאן נמדדת מול סבלנות של לקוחה
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

/** כמה פריטי `preserve` נמסרים למודל התמונה. ראה `stagedEditPrompt`. */
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

/* ===== הפרומפט ===== */

const EDIT_SYSTEM = "You are the conceptual jewelry designer for Aperta, revising a piece you already designed.";

const EDIT_PROMPT = `A customer is looking at a piece of jewellery we made for her and has asked for one change to it. Your job is to turn her request into a precise drawing instruction for an image model that will edit the existing image.

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

"updated_spec" is the specification above, rewritten as it will be AFTER this change — the same five fields, carried forward. Fields the change does not touch are copied across unchanged. This is what the next round will read, so it must describe the piece as it will then be, not the change you made to it.

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
"negative_space": "The empty space the piece uses, as it will be.",
"rhythm_balance": "Movement, symmetry or asymmetry, tension, visual weight, as they will be.",
"manufacturability": "Why this stays one robust manufacturable piece."
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

export function buildEditStagePrompt(input: EditStageInput): string {
  return fill(EDIT_PROMPT, {
    PRODUCT_TYPE: input.productType,
    USER_REQUEST: input.request.trim().replace(/\s+/g, " "),
    REGION: REGION_HINT[input.region ?? "all"],
    LENGTH_MM: input.lengthMm && input.lengthMm > 0
      ? `${Math.round(input.lengthMm * 10) / 10} mm`
      : "not specified",
    CURRENT_SPEC: describeSpec(input.spec),
    MAX_PRESERVE: String(MAX_PRESERVE),
  });
}

/* ===== מה שנמסר למודל התמונה ===== */

/**
 * הטקסט שמחליף את `buildEditPrompt` בקריאה ל-`buildRenderPrompt(editing=true)`.
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
  const spec = box.updated_spec;
  const decision: EditDecision = {
    image_instruction: instruction,
    preserve,
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
