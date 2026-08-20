import { askOpenAi } from "@/lib/llm/openai";
import { addLlmUsage, type LlmUsage } from "@/lib/llm/core";
import type { RenderProductType } from "@/lib/llm/imagegen";
import { ratioBandFor } from "@/lib/story/ratio";
import { DESIGN_COUNT_RANGE, parseDesignSpec, type DesignSpec } from "@/lib/story/designStage";
import { DIALOGUE_INTERVIEW, INTERVIEW_SKIP } from "./mode";
import type { LlmEffort } from "./editStage";
import { coerceEditSpec, describeSpec, hasSpec, nextEditSpec, type EditSpec } from "./spec";

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
// **כיתוב אינו נשאל כאן** אף שהוא ברשימת ה-slots של DIALOGUE_PLAN §3: מסלול
// הכיתוב דורש חיתוך מהפונט ותמונת ייחוס, ויצירת dialogue רצה בלעדיהם
// (כמו Story). מי שמבקשת כיתוב מקבלת מהמודל הפניה לעורך — שם הוא קיים.
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
 * בדיוק אחד משניים: `ask` (השיחה נמשכת) או `summary` (המפרט בשל — התיאור
 * המילולי של §3.1, מחכה לאישור שלה). `spec` הוא המפרט המצטבר **אחרי** הסבב,
 * כבר ממוזג עם הקודם דרך `nextEditSpec` — כלומר עם שמירת המקורות: ערך שלא
 * השתנה יכול רק להתחזק, ומודל אינו מפשיר `user` בשקט.
 */
export interface InterviewTurnDecision {
  spec: EditSpec;
  ask: InterviewAsk | null;
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
{UTM_LINE}
THE MEDIUM — already told to her, and it binds you too: the piece is laser-cut from one flat sheet of metal. Openings and the outer contour are its entire language. No engraving, no stones, no colour, no texture, no relief. If she asks for something outside this, do not translate it into something-that-looks-like: use your question to say, warmly, what the medium can do instead and ask what matters to her about it. Cut lettering exists in the advanced editor, not here — if she asks for text on the piece, say it can be added later in the editor, and continue.

THE CONVERSATION SO FAR

{TRANSCRIPT}

A customer line of "{SKIP}" means she skipped that question: she does not care about that axis. Do not ask about it again — it will be decided for her later.

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

WHAT A TURN RETURNS

"updated_spec" — the fields the conversation has established, in English, concrete enough to draw from. Write only what she said or what you can honestly read from her words; tag each written field in "sources" as "user" or "inferred". Never "chosen" here — undecided axes stay absent until the design round.

Then exactly one of:

"ask" — the next question, in warm spoken Hebrew, feminine address, one question only. You have {REMAINING} questions left ({ASKED} of {CAP} asked); at zero you must summarise instead. Ask only about an axis that seems to matter to her and is still open — the piece's overall feel, motif versus abstraction, how full or open, symmetry, the outer silhouette, how the ends finish, or what to avoid. Give "chips": 2–4 short Hebrew one-tap answers in her vocabulary, or [] for a genuinely open question.

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
"summary": null
}

Include in "updated_spec" only fields the conversation established. "length_to_width_ratio" is a plain number (length divided by width), only if her words imply one — {RATIO_LO} (widest) to {RATIO_HI} (narrowest). Exactly one of "ask" / "summary" is non-null. "ask.question" and "summary" are Hebrew; "updated_spec" fields are English.`;

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
  return fill(INTERVIEW_TURN_PROMPT, {
    PRODUCT_TYPE: input.productType,
    UTM_LINE: input.utm?.trim()
      ? `SHE ARRIVED FROM AN AD — creative id "${input.utm.trim().replace(/\s+/g, " ").slice(0, 120)}". What that ad showed is her opening expectation.\n`
      : "",
    TRANSCRIPT: input.turns.map(transcriptLine).join("\n"),
    SKIP: INTERVIEW_SKIP,
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
}

export function buildInterviewDirectionsPrompt(input: InterviewDirectionsInput): string {
  const [lo, hi] = ratioBandFor(input.productType);
  return fill(INTERVIEW_DIRECTIONS_PROMPT, {
    PRODUCT_TYPE: input.productType,
    CURRENT_SPEC: describeSpec(input.spec, { sources: true }),
    SUMMARY: input.summary.trim().replace(/\s+/g, " "),
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
 * **תנאי הקבילות: בדיוק אחד מ-`ask`/`summary`.** בלעדיהם אין למסך מה להציג —
 * זה ה-`image_instruction` של השלב הזה. מפרט חסר או פסול אינו פוסל: הקודם
 * ממשיך כמו שהוא (`nextEditSpec` עם החלטה ריקה), כי סבב בלי עדכון מפרט הוא
 * מצב תקין — שאלה ראשונה על שיחה ריקה, למשל.
 *
 * כששניהם הוחזרו — הסיכום גובר: המודל אמר שהמפרט בשל, והשאלה הנוספת היא
 * בדיוק "טופס" שהתקרה קיימת כדי למנוע.
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
  if (!summary && !question) return null;

  // צ'יפים הם בונוס ממשקי: מה שאינו מחרוזת נזרק, וריק הוא שאלה פתוחה.
  const chips = (Array.isArray(askBox?.chips) ? askBox.chips : [])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 4);

  const update = coerceEditSpec(box.updated_spec);
  const spec = nextEditSpec(priorSpec, update ? { updated_spec: update } : {});

  const decision: InterviewTurnDecision = {
    spec,
    ask: summary || !question ? null : { question, chips },
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
