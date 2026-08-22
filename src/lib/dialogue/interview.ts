import { askOpenAi } from "@/lib/llm/openai";
import { addLlmUsage, type LlmUsage } from "@/lib/llm/core";
import type { RenderProductType } from "@/lib/llm/imagegen";
import { ratioBandFor } from "@/lib/story/ratio";
import { DESIGN_COUNT_RANGE, parseDesignSpec, type DesignSpec } from "@/lib/story/designStage";
import { DIALOGUE_INTERVIEW, INTERVIEW_SKIP } from "./mode";
import type { LlmEffort } from "./editStage";
import { coerceEditSpec, describeSpec, hasSpec, nextEditSpec, type EditSpec } from "./spec";
import { galleryTagVocabulary, type GalleryAsk } from "./gallery";
import {
  EDIT_CONTROL_KEYS, coerceLettering, type EditControlKey, type EditControlsAsk,
} from "./editControls";

// dialogue mode — הראיון (שלב B): שיחת החידוד שקודמת לרנדר הראשון.
//
// **מה הבעיה שזה פותר.** עד כאן למסלול לא הייתה יצירה משלו: `runsEditStage`
// דורש `currentSvg`, כלומר המסלול טיפל רק בחצי העריכה — וכל עריכה בו רצה
// בהכרח על עיצוב שנוצר במקום אחר. הראיון הוא חצי היצירה: במקום בריף חד-פעמי
// שנקנה עליו רנדר, שיחה קצרה שסוגרת מפרט מוסכם — ורק אז נקנית תמונה.
// בדיקת ציפייה זולה קודמת לרנדר יקר (‏PROMPT_SPEC §3): גלריה, תיאור מילולי,
// צ'יפים — כולם בחינם; רנדר נקנה רק כשהמפרט מוסכם.
//
// **מה הראיון באמת מייצר** (‏§1.3): לא טקסט — **חלוקת שדות למקורות**. כל
// תשובה מזיזה שדות מהמפרט המצטבר ל-`user` (נאמר במפורש) או ל-`inferred`
// (הוסק מדבריה); מה שלא נדון נשאר פתוח עד הסגירה. ראיון טוב ממקסם `user`
// על הצירים שחשובים לה — ולא נוגע בצירים שלא אכפת לה מהם.
//
// **שני שלבים, שתי קריאות שונות:**
//
//  1. **סבב שיחה** (`runInterviewTurn`) — המודל קורא את התמליל והמפרט שהצטבר,
//     מעדכן את המפרט, ומחזיר או שאלה אחת (עם צ'יפים) או **סיכום** — התיאור
//     המילולי של §3.1: "רנדר מילולי בחינם", שפער בין התמונה-שבראש למפרט
//     מתגלה בו ולא אחרי 11–20 שניות ו-$0.006.
//  2. **סגירה** (`runInterviewDirections`) — אחרי שהיא אישרה את הסיכום, המודל
//     גוזר מהמפרט N כיוונים סגורים **בצורת `designStage`** (החמישייה +
//     `image_instruction` + יחס), שנכנסים ל-`buildStagedRenderPrompt` הקיים
//     בלי לגעת בו. שדות `user` זהים בכל הכיוונים; מה שנשאר פתוח מוכרע
//     `chosen`, אחרת בכל כיוון (‏§1.2 — המגוון הוא N מפרטים סגורים, לא צירים
//     פתוחים). כל כיוון נושא גם את השדות המורחבים ואת `sources` — זה מה
//     שמזריע את סבבי העריכה בלי לאבד את מה שהיא אמרה במפורש.
//
// **הטיפולוגיה של §3.5 אינה ארבעה flows.** הראיון פותח באותה שאלה רחבה
// (סטטית, במסך), והתשובה הראשונה ממיינת: מילות צורה → חילוץ; מילות איכות →
// תרגום דרך מילון §4; היסוס → שאלה עקיפה אחת על המניע; ‏utm קיים ממיין עוד
// קודם. הכול תוכן של פרומפט אחד, לא ענפים בקוד — והטיפוס נרשם ליומן בלבד.
//
// **כיתוב נמסר בשיחה — דרך הפאנל, לא דרך מילים חופשיות** (סבב הכיתוב;
// דיוק של גל 21.8 והכרעות 22.8): האמת המכניקית היא שהכיתוב נשלח למודל
// התמונה כתמונת ייחוס שנחתכה מהפונט, והעיצוב נבנה סביבו — קלט של הרנדר,
// לא תוספת על תוצאה. לכן אין לו מקום קבוע בשיחה (האילוץ היחיד: לפני השליחה
// למודל), והוא שדה בפאנל המצב-המדויק (תור `edit`, פקד `lettering`) ולא
// slot של הראיון: האותיות המדויקות הן בדיוק "מה שמילים עושות רע". הטקסט
// שנקבע נוסע מהמסך בכל סבב (`lettering`), הפרומפט מקבל עליו שורת מצב —
// המודל יודע שהוא קיים, מעצב סביבו, ואינו מכניס אותו למפרט (הכיתוב אינו
// שדה מפרט: המפרט מודפס לפרומפט הביצוע, ותיאור מילולי של אותיות הוא בדיוק
// מה שתמונת הייחוס קיימת למנוע) — והפונט נגזר דטרמיניסטית ממילות השיחה
// (`stylesForBrief` על הסיכום והתמליל), בלי שהמודל בוחר פונט: מותר לו רק
// לשאול על מראה האותיות במילים שלה, והתשובה בתמליל היא שמזינה את הטבלה.
//
// **כשל אינו נופל בשקט.** אין כאן מסלול-של-היום ליפול אליו — הראיון הוא
// המסך. `ok: false` חוזר למסך, שמציע לנסות שוב או לעבור לעורך הקיים.

/* ===== התקציב ===== */

/**
 * תקרת ההמתנה לסבב שיחה. קצרה מ-`designStage` (90 שנ׳) כי מולה יושבת לקוחה
 * באמצע שיחה: תשובה היא שאלה אחת ועדכון מפרט, לא 3–6 מפרטים מלאים — ומעל
 * חצי דקה שיחה מפסיקה להרגיש שיחה.
 */
const TURN_TIMEOUT_MS = 45_000;
const TURN_BUDGET_MS = 80_000;

/** הסגירה כותבת N מפרטים מלאים — אותו סדר גודל כמו `designStage`, ולכן
 *  אותם מספרים. */
const DIRECTIONS_TIMEOUT_MS = 90_000;
const DIRECTIONS_BUDGET_MS = 150_000;

/** ניסיון שני, וזהו — אותו נימוק כמו בכל השלבים: רוב הכשלים מקריים,
 *  ושניים ברצף כבר אינם מקרה. */
const INTERVIEW_ATTEMPTS = 2;

/** פחות מזה אין טעם לנסות: התשובה לא תספיק לחזור. */
const MIN_ATTEMPT_MS = 10_000;

/**
 * תקרת השאלות — **כולל** שאלת הפתיחה הרחבה שהמסך מציג סטטית.
 *
 * ‏DIALOGUE_PLAN §3: "ראיון בלי תקרה הוא טופס". 5 היא הקצה העליון של הטווח
 * שנקבע שם (3–5); המודל מקבל בכל סבב כמה נשארו, ובאפס הוא מחויב לסיכום.
 */
export const INTERVIEW_QUESTION_CAP = 5;

// טוקן הדילוג חי ב-`mode.ts` — המסך צריך אותו בלי לגרור את לקוח ה-LLM —
// ומיוצא מחדש מכאן כי הפרומפט הוא הצרכן העיקרי שלו.
export { INTERVIEW_SKIP } from "./mode";

/* ===== מה שנוסע בין המסך לשלב ===== */

/** שורת תמליל אחת. `interviewer` כולל את שאלת הפתיחה הסטטית ואת הסיכומים —
 *  כל מה שהלקוחה ראתה, כדי שהמודל יקרא את השיחה שהיא קראה. */
export interface InterviewTurn {
  role: "interviewer" | "customer";
  text: string;
}

/** השאלה הבאה. `chips` הם תשובות במגע אחד — שכבת הממשק, שבה רשימה סגורה
 *  מותרת ועוזרת (‏PROMPT_SPEC §2.4, שכבה 1). השדה החופשי תמיד קיים לצידם. */
export interface InterviewAsk {
  question: string;
  chips: string[];
}

/**
 * מה שסבב שיחה אחד מחזיר.
 *
 * בדיוק אחד מארבעה: `ask` (השיחה נמשכת בשאלה), `gallery` (השיחה נמשכת
 * בבחירה — ‏§3.2: מדידה דרך בחירות למי שאין לה מילון צורני; המסך מסנן את
 * הרשימה המאוצרת לפי התגים שהמודל החזיר), `edit` (מצב-מדויק בתוך השיחה —
 * החלטת גל 21.8: פקדים מדויקים לרוחב/סימטריה/צפיפות במקום קישור יציאה
 * לעורך) או `summary` (המפרט בשל — התיאור המילולי של §3.1, מחכה לאישור
 * שלה). ההכרעה מי מהם היא של **המודל** (הכרעת גל, 22.8): הטיפולוגיה היא
 * תוכן פרומפט, לא ענפי קוד — נקודה קבועה במסך הייתה מציגה גלריה גם למי
 * שבאה עם תמונה בראש, ופקדים גם למי שמדברת במילות איכות. `spec` הוא המפרט
 * המצטבר **אחרי** הסבב, כבר ממוזג עם הקודם דרך `nextEditSpec` — כלומר עם
 * שמירת המקורות: ערך שלא השתנה יכול רק להתחזק, ומודל אינו מפשיר `user` בשקט.
 */
export interface InterviewTurnDecision {
  spec: EditSpec;
  ask: InterviewAsk | null;
  gallery: GalleryAsk | null;
  /** dialogue mode — תור מצב-מדויק: הזמנה + אילו פקדים. */
  edit: EditControlsAsk | null;
  summary: string | null;
  /** מצב הידיעה הנוכחי (§3.5) — ליומן, לא לזרימה: הטיפוס אינו תווית על
   *  המשתמשת אלא על השיחה, והוא נמדד אחר כך מול סבבים-עד-הזמנה. */
  expectation?: string;
}

export interface InterviewStageSent {
  system: string;
  prompt: string;
}

interface StageMeta {
  sent: InterviewStageSent;
  ms: number;
  usage: LlmUsage | null;
  attempts: number;
  /** ה-JSON כפי שחזר, אחרי ניקוי גדרות. ליומן. */
  json: string;
}

export interface InterviewStageFailure {
  attempts: number;
  sent: InterviewStageSent;
  reason: string;
  ms: number;
  usage: LlmUsage | null;
}

export type InterviewTurnOutcome =
  | ({ ok: true } & StageMeta & { decision: InterviewTurnDecision })
  | ({ ok: false } & InterviewStageFailure);

/**
 * תוצר הסגירה: הכיוונים בצורת `designStage`, פעמיים —
 *
 *  - `json` — כפי שהמודל החזיר, **עם** השדות המורחבים ו-`sources` לכל כיוון.
 *    זה מה שנוסע ב-handoff, נרשם ביומן, ומזריע את סבבי העריכה.
 *  - `renderJson` — אותם כיוונים **בלי** `sources`: מה שנכנס לפרומפט של מודל
 *    התמונה. תיוגי מקור בפרומפט הביצוע הם בדיוק מה ש-§1.3 אוסר — "בדרך
 *    למודל התמונה כל השדות שווים: סגורים".
 */
export type InterviewDirectionsOutcome =
  | ({ ok: true } & StageMeta & { spec: DesignSpec; renderJson: string })
  | ({ ok: false } & InterviewStageFailure);

/* ===== הפרומפטים ===== */

const INTERVIEW_SYSTEM =
  "You are the conceptual jewelry designer for Aperta, planning a piece together with a customer in a short Hebrew conversation.";

/**
 * פרומפט הסבב. מה שחשוב בו, והיכן כל החלטה של PROMPT_SPEC יושבת:
 *
 *  - **מילון §4 נמסר כטבלת תרגום, לא כרשימת צורות.** ההבחנה דקה וחשובה:
 *    רשימת אפשרויות עיצוב בפרומפט התכנון סוגרת את המרחב (לקח 2), אבל טבלת
 *    "מילה שלה ← ציר שלנו" היא הידיעה שהמודל חייב בטיפוס 2 — והיא מסומנת
 *    במפורש כפתיחה, לא כמרחב.
 *  - **שאלה אחת לסבב, עם צ'יפים.** הצ'יפים הם שכבת הממשק — שם רשימה סגורה
 *    מותרת (§2.4). השאלות במילים שלה, לא בשפת מפרט.
 *  - **מקורות: `user` ו-`inferred` בלבד.** ‏`chosen` שמור לסגירה — במהלך
 *    הראיון ציר שלא נדון פשוט נשאר מחוץ למפרט (לקח 3: שדה מומצא מצהיר
 *    בביטחון על פריט אחר).
 *  - **בקשה מחוץ למדיום הופכת לשאלה** (§2.5) — בשלב A היא רק נרשמה; כאן יש
 *    למי לשאול.
 */
const INTERVIEW_TURN_PROMPT = `A customer is planning a custom piece of jewellery with you, in Hebrew. Your job in this turn: read the conversation, update the piece's specification with what you now know, and either ask ONE more question or — when the specification is ready — describe the piece back to her for confirmation.

PRODUCT: "{PRODUCT_TYPE}"   (bracelet or ring)
{UTM_LINE}{LETTERING_LINE}
THE MEDIUM — already told to her, and it binds you too: the piece is laser-cut from one flat sheet of metal. Openings and the outer contour are its entire language. No engraving, no stones, no colour, no texture, no relief. If she asks for something outside this, do not translate it into something-that-looks-like: use your question to say, warmly, what the medium can do instead and ask what matters to her about it. Cut lettering is decided at the START of a piece — the design is built around the letters — and it cannot be added to a finished piece afterwards. This conversation supports it: when she wants text on the piece, return an "edit" turn whose "controls" include "lettering" — the screen gives her an exact text field, and what she types there is cut from our own typefaces exactly as written. Never take the exact letters from free conversation, and never write them yourself: the text goes through that field only.

THE CONVERSATION SO FAR

{TRANSCRIPT}

A customer line of "{SKIP}" means she skipped that question: she does not care about that axis. Do not ask about it again — it will be decided for her later. A skip never leaves the turn empty-handed: move on to a different open axis that seems to matter to her, or — if what you know is enough, or questions ran out — return the summary. Either way you still return exactly one of "ask" / "gallery" / "edit" / "summary".
{GALLERY_CHOICE_BLOCK}{EDIT_CHOICE_BLOCK}

WHAT IS ALREADY ESTABLISHED

Each field is tagged with its source. [user] — she said or approved it explicitly. [inferred] — you read it from her words. Fields not listed are not yet decided, and that is their correct state — do not invent them.

{CURRENT_SPEC}

READING HER

Her first answers tell you what kind of knowing she has, and the interview adapts:

- Shape words ("פסים אלכסוניים", "חור בצורת גל") — she has a picture in her head. Extract it: fill the axes she did not mention, never re-ask what she said. Her explicit words become [user].
- Quality words only ("עדין", "מיוחד", "נקי") — she will know it when she sees it. Translate her words into geometry as [inferred], and ask at most one short question that offers her a concrete either/or to react to.
- No direction at all ("סתם משהו יפה") — ask one short, indirect question about the person and the feeling ("בשביל מי זה? מה תרצי שירגישו כשרואים אותו עלייך?"), form a hypothesis, and move on. A stated motive is a hint, not a fact — her choices later are the measurement.
- If an ad brought her here (noted above), what the ad showed is her opening expectation — start from it.

Translation openers — her word, and the axis it usually moves (openers, not the whole space; translate whatever she actually says in this spirit):

עדין/עדינה → narrower piece, thin lines, more open · עמוס/מעניין → more elements, denser · נקי/מינימליסטי → fewer elements, even rhythm · רך/זורם → curves, rounded corners · חד/גיאומטרי → straight lines, sharp corners · בולט/נוכח → wider piece, more solid · יוקרתי → restraint: few elements, thin even line, symmetry · מיוחד/"שאין לאף אחת" → unusual silhouette, asymmetry — NOT added ornament.
{GALLERY_SECTION}
WHAT A TURN RETURNS

"updated_spec" — the fields the conversation has established, in English, concrete enough to draw from. Write only what she said or what you can honestly read from her words; tag each written field in "sources" as "user" or "inferred". Never "chosen" here — undecided axes stay absent until the design round.

Then exactly one of:

"ask" — the next question, in warm spoken Hebrew, feminine address, one question only. You have {REMAINING} questions left ({ASKED} of {CAP} asked); at zero you must summarise instead. Ask only about an axis that seems to matter to her and is still open — the piece's overall feel, motif versus abstraction, how full or open, symmetry, the outer silhouette, how the ends finish, or what to avoid. Give "chips": 2–4 short Hebrew one-tap answers in her vocabulary, or [] for a genuinely open question.

"gallery" — instead of a question, an invitation to choose: the screen will show her a handful of real pieces matching your "tags", and her pick (or "none of these") comes back as her next message. A gallery counts as one of your questions, exactly like "ask" — at zero remaining, summarise instead.

"edit" — instead of a question, exact controls on screen: a width slider (the piece's length-to-width proportion), one-tap choices for symmetry and cut density, and an exact text field for lettering. Return a warm Hebrew "lead" inviting her to set things exactly, plus "controls" — which of "width" / "symmetry" / "density" / "lettering" to show ([] shows all). Use it when she talks in measures or asks to fix something exactly ("כמה רחב", "אני רוצה לקבוע בדיוק"), when she wants text cut into the piece (then include "lettering"), or when a summary correction keeps missing on one of these axes. What she sets returns as her next message and is her explicit, frozen decision. Do not offer it to someone still exploring in feelings, and not twice unless she asks. An edit counts as one of your questions, exactly like "ask" — at zero remaining, summarise instead.

"summary" — when what you know is enough to design from, or questions ran out: a short Hebrew paragraph, in her language rather than specification language, describing the piece as it will be — and ending by asking if that is right. This is the cheap verbal render: a gap between her mental image and the specification must surface here, not after a paid image. If her last message corrects a previous summary, update the specification and return a corrected summary rather than a new question.

OUTPUT

Return ONLY valid JSON — no markdown, no explanation before or after it:

{
"expectation": "form" | "quality" | "inner" | "ad" | "open",
"updated_spec": {
"outer_silhouette": "…",
"metal_structure": "…",
"negative_space": "…",
"rhythm_balance": "…",
"symmetry": "…",
"ends_treatment": "…",
"metal_void_balance": "…",
"elements": "…",
"manufacturability": "…",
"length_to_width_ratio": 0,
"sources": {"outer_silhouette": "user"}
},
"ask": {"question": "…", "chips": ["…", "…"]},
"gallery": {"lead": "…", "tags": ["…", "…"]},
"edit": {"lead": "…", "controls": ["width", "symmetry", "density", "lettering"]},
"summary": null
}

Include in "updated_spec" only fields the conversation established. "length_to_width_ratio" is a plain number (length divided by width), only if her words imply one — {RATIO_LO} (widest) to {RATIO_HI} (narrowest). Exactly one of "ask" / "gallery" / "edit" / "summary" is non-null. "ask.question", "gallery.lead", "edit.lead" and "summary" are Hebrew; "gallery.tags" are labels from the gallery list; "updated_spec" fields are English.`;

/**
 * שורת מצב הכיתוב בפרומפט הסבב — נכנסת רק כשהכיתוב נקבע (סבב הכיתוב).
 *
 * שלוש ההכרעות של 22.8 (ב') יושבות בה:
 *
 *  - **הכיתוב אינו שדה מפרט** — המפרט מודפס לפרומפט הביצוע, ותיאור מילולי
 *    של אותיות הוא בדיוק מה שתמונת הייחוס קיימת למנוע. השורה אומרת זאת
 *    למודל במפורש, כי הרפלקס הטבעי שלו הוא לתעד כל דבר ב-`updated_spec`.
 *  - **הפונט נגזר מהמילים שלה, לא נבחר על ידי המודל** (§1.2 — אין מודל
 *    שלישי): `stylesForBrief` רץ על הסיכום והתמליל בשרת. מה שמותר למודל
 *    הוא שאלה אחת על מראה האותיות — במילות היומיום שהטבלה מכירה — והתשובה
 *    בתמליל היא שמזינה את הגזירה.
 *  - **שאלת המראה נספרת כשאלה** (הכרעת ג): תור ask רגיל, מהתקרה — בלי
 *    מנגנון ספירה שני.
 */
const LETTERING_LINE = `LETTERING — she has set the exact text to be cut into the piece: "{TEXT}". It is frozen: it will be cut from our own typefaces exactly as written and handed to the image model as a reference image — never described in words. The piece is designed AROUND the letters. Do not put the text in "updated_spec", do not re-ask for it, and do not spell it back letter by letter; changing or removing it happens only through the same "lettering" control. Which typeface is used is derived deterministically from her own Hebrew words about how the letters should feel; if nothing in the conversation implies a look for them and you still have questions left, one short "ask" about the look of the letters — with everyday chips like "עדין", "קלאסי", "נקי", "כתב יד" — is worth one of your questions.
`;

/**
 * פסקת הגלריה בפרומפט הסבב — נכנסת רק כשיש למוצר רשימה מאוצרת ({TAGS} אינו
 * ריק). שלוש ההכרעות של PROMPT_SPEC יושבות בה:
 *
 *  - **המודל מחליט, לא המסך** (§3.5 — הטיפולוגיה היא תוכן פרומפט): גלריה
 *    היא הכלי של מילות-איכות-בלי-מילות-צורה והיסוס, לא של מי שבאה עם תמונה
 *    בראש.
 *  - **התגים הם שפת אחזור, לא מרחב עיצוב** — הגדר מול לקח 2: רשימה סגורה
 *    בפרומפט התכנון מגדירה את מרחב הבחירה, ולכן נאמר במפורש שהרשימה הזו
 *    מאנדקסת פריטים קיימים ואינה אוצר מילים למפרט.
 *  - **גלריה נספרת כשאלה** (הכרעת גל, 22.8) — התקרה נשארת ספירה אחת,
 *    מהתמליל (`askedOf`), בלי מנגנון שני.
 */
const GALLERY_SECTION = `
THE GALLERY

A small curated gallery of real pieces exists, indexed by Hebrew character labels: {TAGS}. Instead of asking another question you may return "gallery": a warm Hebrew "lead" inviting her to pick what speaks to her, plus 1–4 of those labels — the screen shows her a handful of matching pieces, different from each other. A choice measures better than a question when words run short: use the gallery when she speaks in quality words without shape words, or has no direction at all (then let your motive hypothesis pick the labels — a distinctive direction against a classic one, for example). Do not use it when she already describes concrete shapes, and do not show it twice unless she asks to see more. These labels index existing pieces for retrieval only — they are not the design space, not a vocabulary for the specification, and the piece designed for her is not limited to them.
`;

/**
 * מה שנכנס לפרומפט אחרי בחירה בגלריה — תיאור העיצוב שנבחר, כפי שהאוצרות
 * רשמה אותו (`describeGalleryChoice`).
 *
 * ההכרעה של 22.8 (גל) מקודדת כאן: הבחירה מזרימה את **הצירים** של העיצוב
 * למפרט כ-`inferred` — לא העתקה של הפריט ולא הזרעת כיוון שלם בסגירה — ושדות
 * `user` קפואים גם כשהעיצוב שנבחר סותר אותם (מלכודת ההקפאה של §1.3).
 * ה-`concept` נשאר בשיחה, כפי ש-§3.2 קובע: "לא לפרומפט — לשיחה".
 */
const GALLERY_CHOICE_BLOCK = `
SHE CHOSE FROM THE GALLERY

Her last message picked a real piece from the gallery. Our curators describe it:

{CHOICE}

The choice is a measurement, not an order to copy: fold what it reveals about her taste into "updated_spec" as "inferred", in English — the axes the piece shows (silhouette, rhythm, symmetry, how open or full), not a replica of it. Fields already tagged [user] stay exactly as she said, even where this piece differs — a choice refines what was open, it never overwrites her words. Use its concept line to tell her, warmly and in your own Hebrew, what direction you are taking from it — then continue: ask about an axis the choice left open, or summarise if it closed enough.
`;

/**
 * מה שנכנס לפרומפט אחרי קביעה בפקדים המדויקים — הערכים כפי שהשרת ניקה אותם
 * (`describeEditChoice`), עם הטקסטים הקנוניים עצמם.
 *
 * ההצבה במפרט נעשית **בקוד**, אחרי הסבב (`applyEditChoice` — קוד תבנית, לא
 * קריאת מודל, §1.2), ולכן ההנחיה כאן היא על מה שנשאר למודל: לא לשאול שוב על
 * הצירים שנקבעו, ולהמשיך את השיחה. ההעתקה ל-`updated_spec` מתבקשת בכל זאת —
 * שהמודל יראה מפרט עקבי עם מה שהוא כותב — אבל הערך הסופי נאכף בשרת גם אם
 * הוא סטה.
 */
const EDIT_CHOICE_BLOCK = `
SHE SET THE CONTROLS

Her last message set exact controls on screen. What she set:

{CHOICE}

These are her explicit decisions: carry each into "updated_spec" exactly as stated — the texts word for word, the ratio as the exact number — tagged "user" in "sources". They are frozen now; do not ask about these axes again, and later turns change them only if she explicitly asks. Then continue: ask about an axis still open, or summarise if enough is closed.
`;

/**
 * פרומפט הסגירה. ‏§1.2 יושב כאן: המגוון בין המועמדים הוא **החלטה** של מודל
 * הטקסט — N מפרטים סגורים ושונים — לא צירים פתוחים. ומכאן הכלל המרכזי:
 * שדות `user` זהים מילה-במילה בכל הכיוונים, `inferred` יציבים, ומה שנותר
 * פתוח מוכרע `chosen` — אחרת בכל כיוון. למי שסגרה הרבה נשארים כיוונים
 * דומים, **וזה נכון** (§3.1): היא לא ביקשה מגוון, היא ביקשה את מה שבראשה.
 */
const INTERVIEW_DIRECTIONS_PROMPT = `A customer has just finished planning a custom piece with you, in Hebrew, and confirmed the description below. Now write the design directions an image-generation model will execute. You are not drawing — you are deciding what gets drawn.

PRODUCT: "{PRODUCT_TYPE}"   (bracelet or ring)

WHAT WAS AGREED

Each field is tagged with its source. [user] — she said or approved it explicitly: it is frozen, and must appear IDENTICAL, word for word, in every direction. [inferred] — read from her words: keep it in every direction, stable. Anything not listed was left to you.

{CURRENT_SPEC}

THE CONFIRMED DESCRIPTION (Hebrew, what she approved):

"{SUMMARY}"

HOW MANY, AND HOW THEY DIFFER

Return between {COUNT_LO} and {COUNT_HI} designs. They are the same agreed piece — the differences live ONLY in the axes she left open: decide each open axis yourself, differently in each direction, and tag those decisions "chosen". If she pinned almost everything, the directions will be similar — that is correct: she asked for what is in her head, not for variety.

Every decision must be closed (an axis left open is redrawn differently on every run): state every count exactly ("seven openings", never "several"), give sizes as comparisons inside the image ("the band is as narrow as the gap beside it"), never in millimetres, and "none" (no openings, no repeated elements) is a decision — silence is not.

PROPORTION

Each design carries its own "length_to_width_ratio" — a plain number between {RATIO_LO} (widest) and {RATIO_HI} (narrowest). If the specification already carries a [user] or [inferred] ratio, every direction keeps it; otherwise choose per direction, because width is a design decision she left to you.
{LETTERING_BLOCK}
MAKING

Each design is laser-cut from one flat sheet of brass and then rolled. Whatever metal remains has to hold together as a single connected piece.

OUTPUT

Return ONLY valid JSON — no markdown, no explanation before or after it — with one object per design:

{
"product_type": "{PRODUCT_TYPE}",
"designs": [
{
"design_number": 1,
"length_to_width_ratio": 0,
"concept": "How the agreed piece is read in this direction — one sentence, for the conversation, not for drawing.",
"outer_silhouette": "The complete outer contour, described concretely enough to draw — and whether it is a frame that contains the elements, or the elements themselves are the outer edge.",
"metal_structure": "The major connected areas of remaining metal.",
"negative_space": "The empty space this design uses — internal openings, carving of the outer contour, the space around the piece, or none of these.",
"rhythm_balance": "Movement, rhythm, tension, visual weight.",
"symmetry": "Which symmetry the piece keeps — along its length, around its centre, both, or deliberately none.",
"ends_treatment": "How each of the two ends finishes, concretely.",
"metal_void_balance": "How much of the piece is open against solid, as a share of its area — or that it is fully solid.",
"elements": "Every repeated element: shape, exact count, relative line weight, spacing, placement, corners — or that the piece has no repeated elements.",
"region_map": "What sits in the right, centre and left thirds of the piece as drawn — or that it reads as one continuous whole.",
"manufacturability": "Why this stays one robust manufacturable piece.",
"image_instruction": "A concise, geometrically precise instruction describing exactly what to draw.",
"sources": {"outer_silhouette": "user"}
}
]
}

"sources" tags every field of that direction: "user" and "inferred" carried from the specification above, "chosen" for what you decided here. "image_instruction" is the field that matters most — a literal drawing instruction, standing alone. All fields except "concept" are English; "concept" is Hebrew, for her.`;

/**
 * בלוק הכיתוב בפרומפט הסגירה — נכנס רק כשהכיתוב נקבע (סבב הכיתוב).
 *
 * הסגירה כותבת את מה שמודל התמונה יבצע, ולכן זה המקום שבו הגדר חייבת
 * להיאמר: האותיות אינן של הכיוונים — הן מגיעות לרנדר כתמונת ייחוס (הפס
 * נבנה ב-`letteringImage.ts`, פנים אחרות לכל שורה), וכל כיוון מעצב את
 * המתכת סביבן. תיאור אותיות ב-`image_instruction` היה בדיוק "המודל ממציא
 * את האותיות" שהייחוס קיים למנוע.
 */
const DIRECTIONS_LETTERING_BLOCK = `
LETTERING

The piece carries lettering: the exact text "{TEXT}", cut through the metal as openings. The image model receives it as a reference image cut from our own typefaces — the letters are not yours to describe or to draw. Design every direction around them: keep a continuous band of metal where the lettering sits, do not write the text into any field, do not describe letterforms, and do not count the letters among the design's elements. "image_instruction" describes only the metal around the lettering.
`;

/** `{TOKEN}` → ערך. מועתק מ-`editStage` ולא משותף — מסלול מקביל, מחיקתו
 *  מחיקת תיקייה. פונקציית החלפה: תשובה שמכילה `$&` הייתה משכתבת את עצמה. */
function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    out = out.replaceAll(`{${token}}`, () => value);
  }
  return out;
}

/** שורת תמליל אחת, מנורמלת: תו שורה בתוך תשובה היה שובר את מבנה התמליל
 *  שהמודל קורא. */
const transcriptLine = (turn: InterviewTurn): string =>
  `${turn.role === "interviewer" ? "INTERVIEWER" : "CUSTOMER"}: ${turn.text.trim().replace(/\s+/g, " ")}`;

export interface InterviewTurnInput {
  productType: RenderProductType;
  /** התמליל המלא, מהפתיחה — כולל מה שהמסך הציג סטטית. המודל חייב לקרוא את
   *  השיחה שהלקוחה קראה, אחרת הוא שואל את מה שכבר נענה. */
  turns: InterviewTurn[];
  /** המפרט המצטבר מהסבבים הקודמים. `null` בסבב הראשון. */
  spec?: EditSpec | null;
  /** כמה שאלות כבר נשאלו, כולל הפתיחה הסטטית. */
  asked: number;
  /** ‏`utm_content` — הקריאייטיב שהביא אותה (§3.4). `null` = הגיעה ישירות. */
  utm?: string | null;
  /**
   * תיאור העיצוב שנבחר בגלריה (`describeGalleryChoice`), כשההודעה האחרונה
   * היא בחירה. מוזרק פעם אחת — לסבב שמעבד את הבחירה: המודל מקפל את מה
   * שהיא מגלה לתוך המפרט (‏inferred), והמפרט הוא שנושא את זה הלאה.
   */
  galleryChoice?: string | null;
  /**
   * dialogue mode — תיאור הקביעה בפקדים המדויקים (`describeEditChoice`),
   * כשההודעה האחרונה היא קביעה. מוזרק פעם אחת, כמו בחירת גלריה; ההצבה
   * במפרט עצמו נאכפת בשרת (`applyEditChoice`) אחרי הסבב.
   */
  editChoice?: string | null;
  /**
   * הכיתוב שנקבע בפאנל, כפי שהמסך נושא אותו (סבב הכיתוב). נשלח **בכל
   * סבב** ולא רק בסבב הקביעה — בניגוד ל-`editChoice`, הוא מצב מתמשך של
   * הפריט ולא אירוע: המודל חייב לדעת עליו גם חמישה סבבים אחרי שנקבע.
   * מנוקה ב-`coerceLettering`; `null`/ריק = אין כיתוב.
   */
  lettering?: string | null;
}

/**
 * מה שנכתב במקום המפרט כשעוד אין כלום. **לא** `EDIT_SPEC_NONE` — הטקסט ההוא
 * מדבר על פריט קיים שעוצב לפני שנשמר מפרט, וכאן ההפך: אין עדיין פריט, וזה
 * המצב הנכון של תחילת שיחה, לא חוסר בתיעוד.
 */
const SPEC_NOT_STARTED =
  "Nothing yet — the conversation is just beginning, and the specification fills as it goes.";

export function buildInterviewTurnPrompt(input: InterviewTurnInput): string {
  const [lo, hi] = ratioBandFor(input.productType);
  const asked = Math.max(0, Math.min(INTERVIEW_QUESTION_CAP, Math.floor(input.asked)));
  // מוצר בלי רשימה מאוצרת אינו מקבל את הפסקה בכלל — הצעת כלי שאין מאחוריו
  // כלום הייתה מובילה לגלריה ריקה על המסך.
  const vocabulary = galleryTagVocabulary(input.productType);
  const lettering = coerceLettering(input.lettering);
  return fill(INTERVIEW_TURN_PROMPT, {
    PRODUCT_TYPE: input.productType,
    UTM_LINE: input.utm?.trim()
      ? `SHE ARRIVED FROM AN AD — creative id "${input.utm.trim().replace(/\s+/g, " ").slice(0, 120)}". What that ad showed is her opening expectation.\n`
      : "",
    // שורת המצב של הכיתוב — מתמשכת, לא חד-פעמית כמו בלוק הקביעה: הכיתוב
    // הוא מצב של הפריט, והמודל חייב לראות אותו בכל סבב.
    LETTERING_LINE: lettering ? fill(LETTERING_LINE, { TEXT: lettering }) : "",
    TRANSCRIPT: input.turns.map(transcriptLine).join("\n"),
    SKIP: INTERVIEW_SKIP,
    GALLERY_SECTION: vocabulary.length
      ? fill(GALLERY_SECTION, { TAGS: vocabulary.join(" · ") })
      : "",
    GALLERY_CHOICE_BLOCK: input.galleryChoice?.trim()
      ? fill(GALLERY_CHOICE_BLOCK, { CHOICE: input.galleryChoice.trim() })
      : "",
    EDIT_CHOICE_BLOCK: input.editChoice?.trim()
      ? fill(EDIT_CHOICE_BLOCK, { CHOICE: input.editChoice.trim() })
      : "",
    CURRENT_SPEC: hasSpec(input.spec)
      ? describeSpec(input.spec, { sources: true })
      : SPEC_NOT_STARTED,
    ASKED: String(asked),
    REMAINING: String(INTERVIEW_QUESTION_CAP - asked),
    CAP: String(INTERVIEW_QUESTION_CAP),
    RATIO_LO: `1:${lo}`,
    RATIO_HI: `1:${hi}`,
  });
}

export interface InterviewDirectionsInput {
  productType: RenderProductType;
  /** המפרט המוסכם — מה שהצטבר עד האישור. הסגירה אינה רצה על מפרט ריק:
   *  אין ממה לגזור כיוונים, וזה נאכף בקורא (המסך אינו מציע אישור בלעדיו). */
  spec: EditSpec;
  /** הסיכום שאושר, בעברית — העוגן שהכיוונים חייבים לכבד. */
  summary: string;
  /** הכיתוב שנקבע בפאנל (סבב הכיתוב) — הסגירה חייבת לדעת שהכיוונים
   *  מעצבים סביבו. `null`/ריק = אין כיתוב. */
  lettering?: string | null;
}

export function buildInterviewDirectionsPrompt(input: InterviewDirectionsInput): string {
  const [lo, hi] = ratioBandFor(input.productType);
  const lettering = coerceLettering(input.lettering);
  return fill(INTERVIEW_DIRECTIONS_PROMPT, {
    PRODUCT_TYPE: input.productType,
    CURRENT_SPEC: describeSpec(input.spec, { sources: true }),
    SUMMARY: input.summary.trim().replace(/\s+/g, " "),
    LETTERING_BLOCK: lettering ? fill(DIRECTIONS_LETTERING_BLOCK, { TEXT: lettering }) : "",
    COUNT_LO: String(DESIGN_COUNT_RANGE[0]),
    COUNT_HI: String(DESIGN_COUNT_RANGE[1]),
    RATIO_LO: `1:${lo}`,
    RATIO_HI: `1:${hi}`,
  });
}

/* ===== הפענוח ===== */

/** גדר markdown סביב ה-JSON — אותה סיבה כמו בכל השלבים: הפרומפט מבקש
 *  "no markdown", מודלים עוטפים בכל זאת, וסבב ששולם עליו אינו נפסל על עטיפה. */
function unfence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * סבב שיחה, אם הוא שמיש. `null` על כל דבר אחר.
 *
 * **תנאי הקבילות: בדיוק אחד מ-`ask`/`gallery`/`edit`/`summary`.** בלעדיהם אין
 * למסך מה להציג — זה ה-`image_instruction` של השלב הזה. מפרט חסר או פסול אינו
 * פוסל: הקודם ממשיך כמו שהוא (`nextEditSpec` עם החלטה ריקה), כי סבב בלי
 * עדכון מפרט הוא מצב תקין — שאלה ראשונה על שיחה ריקה, למשל.
 *
 * כשהוחזר יותר מאחד — הקדימות היא סיכום, מצב-מדויק, גלריה, שאלה: סיכום אומר
 * שהמפרט בשל, וכל תור נוסף הוא בדיוק "טופס" שהתקרה קיימת כדי למנוע; מצב-מדויק
 * לפני גלריה כי מודל שהחזיר אותו ענה לבקשה מפורשת לקבוע — הצעת בחירה היא כלי
 * למי שמילים אזלו לה; וגלריה לפני שאלה מאותו נימוק — השאלה היא הגיבוי.
 */
export function parseInterviewTurn(
  raw: string,
  priorSpec: EditSpec | null | undefined,
): { json: string; decision: InterviewTurnDecision } | null {
  const json = unfence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const box = parsed as Record<string, unknown>;

  const summary = typeof box.summary === "string" && box.summary.trim() ? box.summary.trim() : null;
  const askBox = box.ask && typeof box.ask === "object" && !Array.isArray(box.ask)
    ? (box.ask as Record<string, unknown>)
    : null;
  const question = typeof askBox?.question === "string" && askBox.question.trim()
    ? askBox.question.trim()
    : null;
  const galleryBox = box.gallery && typeof box.gallery === "object" && !Array.isArray(box.gallery)
    ? (box.gallery as Record<string, unknown>)
    : null;
  const lead = typeof galleryBox?.lead === "string" && galleryBox.lead.trim()
    ? galleryBox.lead.trim()
    : null;
  const editBox = box.edit && typeof box.edit === "object" && !Array.isArray(box.edit)
    ? (box.edit as Record<string, unknown>)
    : null;
  const editLead = typeof editBox?.lead === "string" && editBox.lead.trim()
    ? editBox.lead.trim()
    : null;
  if (!summary && !question && !lead && !editLead) return null;

  // צ'יפים הם בונוס ממשקי: מה שאינו מחרוזת נזרק, וריק הוא שאלה פתוחה.
  const chips = (Array.isArray(askBox?.chips) ? askBox.chips : [])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 4);

  // תגי השאילתה — כמו הצ'יפים: מה שאינו מחרוזת נזרק, וריק הוא שאילתה פתוחה
  // (הבחירה במסך נופלת לגיוון טהור על הרשימה המאוצרת).
  const tags = (Array.isArray(galleryBox?.tags) ? galleryBox.tags : [])
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, 6);

  // הפקדים — רק מהרשימה המוכרת, בלי כפילויות; ריק נקרא "הצג הכול": הזמנה
  // למצב-מדויק בלי אף פקד הייתה משאירה את המסך בלי מה להציג.
  const controls = [...new Set(
    (Array.isArray(editBox?.controls) ? editBox.controls : [])
      .filter((k): k is EditControlKey => (EDIT_CONTROL_KEYS as readonly unknown[]).includes(k)),
  )];

  const update = coerceEditSpec(box.updated_spec);
  const spec = nextEditSpec(priorSpec, update ? { updated_spec: update } : {});

  const edit = !summary && editLead
    ? { lead: editLead, controls: controls.length ? controls : [...EDIT_CONTROL_KEYS] }
    : null;
  const gallery = !summary && !edit && lead ? { lead, tags } : null;
  const decision: InterviewTurnDecision = {
    spec,
    ask: summary || edit || gallery || !question ? null : { question, chips },
    gallery,
    edit,
    summary,
    ...(typeof box.expectation === "string" && box.expectation.trim()
      ? { expectation: box.expectation.trim().slice(0, 40) }
      : {}),
  };
  return { json, decision };
}

/**
 * הכיוונים, אם הם שמישים.
 *
 * הקבילות היא **בדיוק זו של `designStage`** — `parseDesignSpec`: מספר כיוונים
 * בטווח, `image_instruction` לכל אחד. זה מכוון: הפלט נכנס לאותו צינור, ומה
 * שהיה נפסל שם נפסל גם כאן. מה שנוסף הוא `renderJson` — אותם כיוונים בלי
 * `sources`, כי תיוגי מקור אינם מגיעים לפרומפט הביצוע לעולם (§1.3).
 */
export function parseInterviewDirections(
  raw: string,
): { json: string; spec: DesignSpec; renderJson: string } | null {
  const parsed = parseDesignSpec(raw);
  if (!parsed) return null;
  return { ...parsed, renderJson: renderJsonOf(parsed.spec) };
}

/**
 * הכיוונים כפי שמודל התמונה יקרא אותם: בלי `sources`.
 *
 * בנייה מחדש דטרמיניסטית ולא עריכת מחרוזת — ההידור מהמפרט המוסכם לפרומפט
 * הוא קוד תבנית, לא קריאת מודל (‏PROMPT_SPEC §1.2, "אין מודל שלישי").
 * שאר השדות עוברים כמות שהם: השדות המורחבים הם עוד גיאומטריה סגורה, ומה
 * שאינו גיאומטריה (`concept`) כבר מוצהר בפרומפט הקיים כרקע שאין לצייר.
 */
export function renderJsonOf(spec: DesignSpec): string {
  return JSON.stringify(
    {
      ...(spec.product_type ? { product_type: spec.product_type } : {}),
      designs: spec.designs.map((d) => {
        const { sources: _sources, ...rest } = d as typeof d & { sources?: unknown };
        return rest;
      }),
    },
    null,
    1,
  );
}

/* ===== ההרצה ===== */

/**
 * לולאת הניסיונות המשותפת לשני השלבים — אותה תבנית כמו `runEditStage`, פעמיים.
 * מה שנצרך נצבר לפני בדיקת הקבילות: ניסיון שהחזיר JSON פסול שולם עליו.
 */
async function runStage<T>(
  prompt: string,
  parse: (raw: string) => T | null,
  budget: { timeoutMs: number; budgetMs: number },
  model: string | undefined,
  effort: LlmEffort | undefined,
): Promise<{ ok: true; value: T; meta: StageMeta } | ({ ok: false } & InterviewStageFailure)> {
  const startedAt = Date.now();
  const sent: InterviewStageSent = { system: INTERVIEW_SYSTEM, prompt };
  let usage: LlmUsage | null = null;
  let reason = "";
  let attempts = 0;

  for (let attempt = 1; attempt <= INTERVIEW_ATTEMPTS; attempt++) {
    const left = budget.budgetMs - (Date.now() - startedAt);
    if (left < MIN_ATTEMPT_MS) {
      if (!reason) reason = "interview budget exhausted before the first attempt";
      break;
    }
    attempts = attempt;
    try {
      const answer = await askOpenAi({
        system: INTERVIEW_SYSTEM,
        userText: prompt,
        model: model || DIALOGUE_INTERVIEW.model,
        reasoningEffort: effort || DIALOGUE_INTERVIEW.effort,
        timeoutMs: Math.min(budget.timeoutMs, left),
      });
      usage = addLlmUsage(usage, answer.usage);
      const value = parse(answer.text);
      if (value !== null) {
        return {
          ok: true,
          value,
          meta: { sent, ms: Date.now() - startedAt, usage, attempts, json: unfence(answer.text) },
        };
      }
      reason = `unusable output: ${answer.text.slice(0, 200).replace(/\s+/g, " ")}`;
      console.error(`dialogue interview attempt ${attempt}: ${reason}`);
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
      console.error(`dialogue interview attempt ${attempt} failed:`, reason);
    }
  }

  return { ok: false, attempts, reason, sent, ms: Date.now() - startedAt, usage };
}

/** סבב שיחה אחד, מקצה לקצה. `model`/`effort` פרמטרים — המכרז של §5.4 נבדק
 *  בלי לגעת בקבועים, כמו בכל השלבים. */
export async function runInterviewTurn(
  input: InterviewTurnInput & { model?: string; effort?: LlmEffort },
): Promise<InterviewTurnOutcome> {
  const out = await runStage(
    buildInterviewTurnPrompt(input),
    (raw) => parseInterviewTurn(raw, input.spec),
    { timeoutMs: TURN_TIMEOUT_MS, budgetMs: TURN_BUDGET_MS },
    input.model,
    input.effort,
  );
  if (!out.ok) return out;
  return { ok: true, ...out.meta, decision: out.value.decision };
}

/** הסגירה: מהמפרט המאושר ל-N כיוונים בצורת `designStage`. */
export async function runInterviewDirections(
  input: InterviewDirectionsInput & { model?: string; effort?: LlmEffort },
): Promise<InterviewDirectionsOutcome> {
  // מפרט ריק אינו נסגר: אין ממה לגזור, וכיוונים "מהאוויר" היו בדיוק הבריף
  // החד-פעמי שהראיון בא להחליף. הקורא (המסך) ממילא אינו מגיע לכאן בלעדיו.
  if (!hasSpec(input.spec)) {
    return {
      ok: false,
      attempts: 0,
      sent: { system: INTERVIEW_SYSTEM, prompt: "" },
      reason: "empty specification — nothing to derive directions from",
      ms: 0,
      usage: null,
    };
  }
  const out = await runStage(
    buildInterviewDirectionsPrompt(input),
    parseInterviewDirections,
    { timeoutMs: DIRECTIONS_TIMEOUT_MS, budgetMs: DIRECTIONS_BUDGET_MS },
    input.model,
    input.effort,
  );
  if (!out.ok) return out;
  return { ok: true, ...out.meta, spec: out.value.spec, renderJson: out.value.renderJson };
}

/* ===== מה שהצינור צריך מהכיוונים ===== */

/**
 * כמה שאלות כבר נשאלו, מהתמליל עצמו — ולא ממונה שהלקוח שולח.
 *
 * המסך יכול לשלוח כל מספר; התמליל הוא מה שהמודל ממילא קורא, ולכן הוא גם
 * המקור למניין. סיכומים נספרים כשאלות לצורך התקרה — הם תור של המראיין —
 * וזה שמרני בכיוון הנכון: עודף ספירה מקצר ראיון, חוסר ספירה מאריך אותו.
 */
export function askedOf(turns: InterviewTurn[]): number {
  return turns.filter((t) => t.role === "interviewer").length;
}

/** ניקוי תמליל שהגיע מבחוץ — מהמסך או מ-handoff. מה שאינו שורה תקינה נזרק
 *  בשקט; החיתוך שומר על הפרומפט בגודל שפוי גם מול לקוח עוין. */
export function coerceInterviewTurns(raw: unknown): InterviewTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
    .map((t) => ({
      role: t.role === "interviewer" ? ("interviewer" as const) : ("customer" as const),
      text: typeof t.text === "string" ? t.text.trim().slice(0, 2000) : "",
    }))
    .filter((t) => t.text.length > 0)
    .slice(-40);
}
