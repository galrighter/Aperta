import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, jsonError, ApiError } from "@/lib/api";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import { createSampleDesign, getDesign, getVersion, reserveGeneration, updateDesignWidth } from "@/lib/db/designs";
import { STORY_MODE, isStory, orderByVariety, storyFrameDims, widthRangeOf } from "@/lib/story/mode";
import { svgFrame } from "@/lib/geometry/frame";
import { requireDesignAccess } from "@/lib/designAccess";
import { requireAdmin } from "@/lib/admin";
import { dataUrlMediaType, signedUrl } from "@/lib/db/storage";
import { buildRenderPrompt, LETTERING_MODEL } from "@/lib/llm/imagegen";
import { LlmError, type LlmImage } from "@/lib/llm/core";
import { ingestCutouts, designDims, type FramedPreview } from "@/lib/vectorizer";
import { MAX_CANDIDATES, NATURAL_RATIO, planRender, type RenderPlan } from "@/lib/render/panels";
import { canvasFor, sizeParam } from "@/lib/render/canvas";
import { pickClosestRatio, ratioGap } from "@/lib/render/ratioGap";
import { buildBaseRenderSvg } from "@/lib/render/baseImage";
import { buildLetteringRenderSvg } from "@/lib/render/letteringImage";
import { runRenderJob } from "@/lib/render/service";
import { frameCandidates } from "@/lib/render/frameClient";
import { deriveAttemptId } from "@/lib/render/attemptId";
import { persistRun, type PersistRunInput } from "@/lib/runs/persist";
import { describeFailure, markRunError } from "@/lib/db/runs";
import { letteringBridgeCheck, type JobContext } from "@/lib/runs/complete";
import { startJob, failJob, finishJob, setJobStage, setJobContext, JobConflictError } from "@/lib/db/jobs";
import { designSampleCode } from "@/lib/designCode";
import { isQuotaFailure, alertQuotaExhausted } from "@/lib/alerts/quota";
import { alertUnexpectedFailure, isSystemicFailure } from "@/lib/alerts/failures";
import { notifyDesignReady } from "@/lib/designReadyNotice";
import type { DesignRow } from "@/lib/db/designs";

// יצירה במסלול ה-AI (מסלול 2): טקסט/השראה → מודל תמונה (רנדר של התכשיט) →
// קונדישנינג + vectorizer → cutouts SVG → צינור הוולידציה הקיים → גרסה.
//
// החצי הכבד של הצינור רץ על הקופסה (src/lib/render/service.ts): שם ההדמיות
// נוצרות, נחתכות לשורות, מומרות לווקטור ונכתבות ל-storage. כאן נשאר מה שדורש
// ידע על ייצור — התכנון, הפרומפט, הוולידציה והגרסה — ובמונחי משאבים זו כמעט
// כולה המתנה ל-I/O. זה ההבדל בין הרצה שנהרגת ב-1102 לבין תשובה.
//
// כל הרצה נשמרת ל-generation_runs (כולל דחייה/שגיאה) ליומן הבק־אופיס.
//
// **מה שורד ניתוק, ולמה זה לא isolate.** קודם העבודה הועברה ל-waitUntil
// וההחזרה הייתה 202 מיידי — ובפרודקשן העבודה פשוט לא רצה: כל יצירה נתקעה על
// stage=rendering, לא נכתבה שום שורה ל-generation_runs, ואחרי שש דקות הלקוחה
// קיבלה job_stalled בלי שגיאה, כי לא היה מי שיכתוב אותה (שלוש הרצות, 27.7,
// אחרי #61). המסקנה: אין להישען על isolate שממשיך לחיות אחרי שהתשובה יצאה.
//
// מה שיש במקום: מי שעושה את העבודה היקרה מחזיק את התוצאה. הקופסה מריצה את
// הרנדר תחת מזהה שנגזר מ-`jobId` של הלקוחה (`render/attemptId.ts`), ולכן
// הניתוק כבר לא מוחק את מה ששולם: הבקשה הבאה עם אותו `jobId` נכנסת לאותו job,
// מקבלת את התוצאה השמורה בלי קריאה נוספת למודל, ומסיימת את השמירה. העבודה
// עצמה עדיין רצה בתוך הבקשה הזו — היא פשוט כבר לא היחידה שיכולה לסיים אותה.
// החוזה המלא: docs/C2_RESILIENT_GENERATION.md.

export const maxDuration = 300;

/**
 * עד מתי מותר **להתחיל** ניסיון רנדר שני.
 *
 * הבקשה נהרגת ב-`maxDuration` (300 שניות), והרצה טיפוסית לוקחת 25–50. ניסיון
 * שני שמתחיל בשנייה ה-200 יכול להיהרג באמצע — כלומר הלקוחה משלמת את ההמתנה
 * ואת הקריאה למודל ומקבלת בסוף ניתוק במקום את השגיאה המסבירה שכבר הייתה בידנו.
 * מ-150 שניות והלאה מוותרים על הניסיון השני ומחזירים את מה שיש.
 */
const RETRY_DEADLINE_MS = 150_000;

const imageSchema = z.object({
  kind: z.enum(["inspiration", "annotation"]),
  dataUrl: z.string().max(8_000_000),
});

const schema = z.object({
  designId: z.string().uuid(),
  /** מזהה ההרצה, מיוצר בלקוחה. מאפשר למשוך את התוצאה מ-/api/generate/<id>
   *  אחרי שהחיבור נקטע, בלי לחכות שהשרת יחזיר אותו. */
  jobId: z.string().uuid().optional(),
  userPrompt: z.string().min(1).max(4000),
  /**
   * הכיתוב שהלקוחה ביקשה על התכשיט. הוא **אינו** נכנס לפרומפט אלא נחתך
   * אצלנו מהפונט ונמסר למודל כתמונת ייחוס (lib/render/letteringImage.ts):
   * כשהוא כותב לפי מילים הוא בולע אותיות ומתקן כתיב, וכשיש לו מה להעתיק הוא
   * מדייק ברוב החלופות. ברוב, לא בכולן — הלקוחה בוחרת ומאשרת.
   */
  text: z.string().max(40).optional(),
  currentSvg: z.string().max(500_000).nullable().optional(),
  /** הגרסה ש-`currentSvg` נלקח ממנה — ליומן בלבד, כדי שיהיה אפשר להעמיד את
   *  הפרומפט מול מה שהמודל באמת ראה. הלקוחה יכולה לערוך גרסה ישנה, ולכן זו
   *  לא בהכרח הגרסה הנוכחית של העיצוב. */
  baseVersionId: z.string().uuid().optional(),
  images: z.array(imageSchema).max(3).default([]),
  /**
   * story mode — המסלול הפשוט (`/story`). ההבדל היחיד: אין רוחב שנבחר, ולכן
   * הרוחב נגזר מהיחס שהמודל צייר ונשמר על הרשומה, והמסגור מקבל אותו כמות
   * שהוא — כלומר קנה מידה אחיד. ראה src/lib/story/mode.ts.
   *
   * אופציונלי, וברירת המחדל היא ההתנהגות הקיימת: בקשה בלי השדה הזה עוברת
   * בדיוק באותו קוד כמו קודם.
   */
  mode: z.literal(STORY_MODE).optional(),

  // --- כיול פרומפט (בק־אופיס בלבד; ראה את השער ב-POST) ---
  /** הפרומפט המדויק שיישלח למודל, במקום זה שנבנה מהמידות. */
  promptOverride: z.string().max(8000).optional(),
  /** כמה פריטים בתמונה, במקום מה ש-planRender גוזר מהיחס. */
  rowsOverride: z.number().int().min(1).max(40).optional(),
});

const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request) {
  const startedAt = Date.now();
  // עד שידוע ה-jobId — כשלים לפני פענוח הגוף עדיין צריכים מזהה ליומן.
  let runId = crypto.randomUUID();
  let pipelineStarted = false;
  let designId: string | null = null;
  let userPrompt: string | null = null;

  try {
    const body = await parseBody(req, schema);
    designId = body.designId;
    userPrompt = body.userPrompt;
    // האימותים שהלקוחה צריכה לדעת עליהם מיד — בעלות, עיצוב קיים, מכסה יומית,
    // תמונות תקינות — נשארים סינכרוניים. אין טעם להחזיר job שכבר ידוע שייכשל.
    //
    // הבעלות היא הראשונה שנבדקת, והיא היחידה שעולה כסף: יצירה היא הרצת מנוע,
    // והמכסה נספרת על הפרופיל של העיצוב. בלי הבדיקה הזו מזהה עיצוב של חבר היה
    // מספיק כדי לשרוף את המכסה שלו — ואת התקציב שלנו.
    // כיול הפרומפט רץ על **אותו מסלול** כמו הלקוחה — זו כל הנקודה: הבדל אחד
    // מכוון ולא צינור שני שנשאר תואם בזכות משמעת. אבל טקסט חופשי שנשלח ישירות
    // למודל התמונה עם המפתח שלנו הוא, בלי שער, כרטיס אשראי פתוח לכל אחד.
    if (body.promptOverride || body.rowsOverride) requireAdmin(req);

    const design = await requireDesignAccess(req, body.designId);
    assertBuildableDims(design);
    for (const img of body.images) {
      const mediaType = dataUrlMediaType(img.dataUrl);
      if (!ALLOWED_MEDIA.has(mediaType)) {
        throw new ApiError("bad_image", `Unsupported image type ${mediaType}`, 400);
      }
    }

    // מזהה שהלקוחה מייצרת מראש, כדי שתוכל למשוך את השורה גם אם הבקשה נקטעה.
    const jobId = body.jobId ?? crypto.randomUUID();
    // ומכאן מזהה ההרצה נגזר ממנו ולא מוגרל: זה מה שמאפשר לבקשה חוזרת לאסוף
    // הרצה ששולמה כבר במקום לקנות שנייה. ראה render/attemptId.ts.
    runId = await deriveAttemptId(jobId, 1);

    // שתי מכסות נפרדות לפרופיל ליום: הצלחות וכישלונות. נספרות מהרצות הצינור,
    // לא מגרסאות — כך שעיון בחלופות (שיוצר גרסת pick) לא אוכל מכסה, וכישלון
    // שכבר עלה כסף על תמונה לא נשאר חינמי אינסופית.
    //
    // השריון אטומי ומזוהה ב-`runId`: הוא נעשה **אחרי** גזירת המזהה כדי שבקשה
    // שמתחדשת אחרי ניתוק תשריין את אותה יחידה במקום יחידה שנייה על אותה הרצה.
    const verdict = await reserveGeneration({
      runId,
      profileId: design.profile_id,
      approvedLimit: FAB.DAILY_GENERATION_LIMIT,
      failedLimit: FAB.DAILY_FAILED_GENERATION_LIMIT,
    });
    if (verdict === "approved_limit") {
      throw new ApiError("rate_limited", `Daily generation limit reached (${FAB.DAILY_GENERATION_LIMIT}/day)`, 429);
    }
    if (verdict === "failed_limit") {
      throw new ApiError("rate_limited", `Daily failed-generation limit reached (${FAB.DAILY_FAILED_GENERATION_LIMIT}/day)`, 429);
    }

    // שורת ה-job היא רישום, לא תנאי להרצה: אם הטבלה חסרה (חלון בין פריסה
    // למיגרציה) היצירה עדיין רצה.
    try {
      await startJob({ id: jobId, designId: design.id, runId });
    } catch (e) {
      // job של עיצוב אחר אינו חלון מיגרציה — דוחים במקום להריץ בשקט ולתת
      // ל-finishJob לכתוב על שורה זרה. חידוש של הרצה שעדיין רצה על אותו עיצוב
      // כן מותר, ו-startJob מבדיל ביניהם. job שהסתיים על אותו עיצוב מקבל את
      // התשובה שלו — ראה `replayFinishedJob`.
      if (e instanceof JobConflictError) {
        const replay = replayFinishedJob(e, design.id);
        if (replay) return replay;
        throw new ApiError("job_conflict", "This job id is already in use", 409);
      }
      console.error("job row unavailable, running without it:", (e as Error).message);
    }

    try {
      pipelineStarted = true;
      const payload = await runGeneration(body, runId, jobId);
      await finishJob(jobId, runId, payload);
      // מי שסגרה את החלון באמצע היצירה לא ידעה שהעיצוב מוכן. `design` נקרא
      // *לפני* ההרצה, ולכן `current_version_id` שלו הוא המצב שקדם לה — וזה מה
      // שמבדיל יצירה ראשונה מעריכה.
      await notifyDesignReady(design, !design.current_version_id);
      return NextResponse.json(payload);
    } catch (err) {
      await failJob(jobId, runId, toJobError(err));
      throw err;
    }
  } catch (err) {
    // דחייה לפני שהצינור התחיל — תמונה לא נתמכת, עיצוב לא קיים, גוף בקשה פסול
    // — לא השאירה עד עכשיו שום עקבה. המשתמש ראה שגיאה והיומן לא ראה כלום, כך
    // שהתלונה "יצרתי ואין את זה ביומן" לא הייתה ניתנת לאבחון. אחרי שהצינור
    // התחיל, runGeneration כבר כותב את השורה בעצמו.
    //
    // חריג אחד: דחייה על המכסה עצמה. היא אינה הרצה — שום דבר לא רץ ושום דבר לא
    // שולם — ולרשום אותה כהרצה שנכשלה יוצר מעגל: פרופיל שהגיע לתקרת ההצלחות
    // מייצר שורת כישלון בכל ניסיון נוסף, וסוגר על עצמו גם את מכסת הכישלונות.
    // הסיבה ידועה ודטרמיניסטית ממילא; אין מה לאבחן בה.
    const quotaRejection = err instanceof ApiError && err.code === "rate_limited";
    if (!pipelineStarted && !quotaRejection) {
      await persistRun({
        id: runId,
        source: "studio",
        designId,
        prompt: userPrompt,
        colorKey: "dark",
        startedAt,
        error: err instanceof Error ? err.message : String(err),
        vectorizer: null,
      });
    }
    return handleRouteError(err);
  }
}


/**
 * הסטטוס שהכשל היה מחזיר בהרצה שבה הוא קרה. `failJob` שומר קוד והודעה בלבד,
 * ולכן הוא נבנה כאן מחדש. ברירת המחדל 500 — מה ש-`handleRouteError` נותן לכל
 * מה שאינו `ApiError`, וזה בדיוק מה ש-`internal` הוא.
 *
 * שום קוד כאן אינו 5xx-בלי-קוד, ולכן שידור חוזר של כשל לא מפעיל בטעות את מסלול
 * ההתאוששות בלקוחה (`mayHaveSurvived`) — הוא נשען על היעדר קוד.
 */
const REPLAY_STATUS: Record<string, number> = {
  bad_size: 400,
  bad_image: 400,
  text_too_long: 400,
  invalid_input: 400,
  content_blocked: 422,
  vectorize_failed: 422,
  rate_limited: 429,
  render_busy: 503,
  quota_exhausted: 503,
};

/**
 * התשובה של job שכבר הסתיים — במקום 409 על התנגשות מזהה.
 *
 * **מה נשבר בלעדיה (AP-0090).** ה-`jobId` נוצר בלקוחה, והיא ממחזרת אותו
 * בכוונה: ניסיון חוזר על אותו קלט חוזר לאותה הרצה בקופסה במקום לקנות שנייה
 * (`docs/C2_RESILIENT_GENERATION.md`). היא שומרת אותו בדיוק כשהבקשה נקטעה בלי
 * תשובת שרת — ניתוק, מסך שננעל — כלומר בדיוק כשהשרת ממשיך לרוץ ומסיים לכתוב
 * `done`/`error` על אותה שורה. הניסיון החוזר נחת אז על 409 גנרי: "משהו
 * השתבש", בזמן שהתוצאה ששולמה כבר ישבה בטבלה. הלחיצה הבאה — שקיבלה מזהה חדש,
 * כי 409 היא תשובת שרת ולכן מנקה את המזהה — הריצה את הכול מחדש: עוד קריאה
 * למודל, עוד יחידת מכסה, ועוד גרסה על אותו עיצוב.
 *
 * המסמך תמיד אמר "התוצאה שם, שיקרא אותה" — פשוט לא היה מי שיקרא. זה הקורא.
 *
 * הבעלות כבר נבדקה: `designId` הוא העיצוב ש-`requireDesignAccess` עבר עליו,
 * ושורה של עיצוב אחר נופלת מכאן החוצה ל-409 — שם ההגנה באמת נחוצה.
 *
 * `null` = לא שידור חוזר אלא התנגשות אמיתית, והקורא זורק 409.
 */
function replayFinishedJob(err: JobConflictError, designId: string): NextResponse | null {
  const job = err.job;
  if (!job || job.design_id !== designId) return null;
  // התוצאה השמורה, מילה במילה. `notifyDesignReady` **לא** נשלח כאן: מי שכתב
  // את `done` כבר שלח אותו, ושליחה שנייה היא מייל שני על אותו עיצוב.
  if (job.status === "done" && job.result) return NextResponse.json(job.result);
  // הכשל המקורי, עם הקוד שלו. 409 במקומו הסתיר מהלקוחה סיבה שכן היה לה נוסח
  // משלה — `content_blocked` שולח לנסח מחדש, `bad_size` שולח למסך המידות —
  // והציג במקומה "משהו השתבש", שהוא בדיוק העצה הלא נכונה.
  if (job.status === "error" && job.error) {
    const { code, message } = job.error;
    return jsonError(code, message, REPLAY_STATUS[code] ?? 500);
  }
  return null;
}

/**
 * שער השפיות על מידות העיצוב, לפני שיוצאת קריאה שעולה כסף.
 *
 * זו **אינה** ולידציית ייצור — היא רצה על הפריסה שהוזמנה, לא על מה שנחתך —
 * ואינה מתקנת דבר. היא דוחה אורך שאינו יכול להיות פריסה של תכשיט על גוף.
 *
 * למה בשרת ולא רק במסך המידות: המסך הוא הגנה טובה מפני הקלדה, אבל הכסף נשרף
 * כאן. ב-AP-0077 (3.8.26) הוזמן צמיד בהיקף 10 מ"מ; הפרומפט ביקש ממודל התמונה
 * פריט "15.8mm long and 18mm wide", המודל צייר בדיוק את זה, והווקטורייזר עקב
 * אחריו ב-IoU 0.93. ההרצה נרשמה `approved` — כי לפי כל מדד בצינור היא הצליחה.
 * אין שער אחרי הרנדר שיכול לתפוס קלט בלתי אפשרי, וניסיון חוזר ברקע היה מחזיר
 * את אותו ריבוע בדיוק, בכסף נוסף.
 */
function assertBuildableDims(design: DesignRow): void {
  const [lo, hi] = FAB.products[design.product_type].lengthLimitMm;
  const lengthMm = Number(design.length_mm);
  if (!Number.isFinite(lengthMm) || lengthMm < lo || lengthMm > hi) {
    throw new ApiError(
      "bad_size",
      `Blank length ${design.length_mm}mm is outside what a ${design.product_type} can be (${lo}–${hi}mm) — check the measurement that produced it.`,
      400,
    );
  }
}

function toJobError(err: unknown) {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  if (err instanceof LlmError) return { code: "llm_error", message: err.message };
  return { code: "internal", message: err instanceof Error ? err.message : String(err) };
}

type GenerateBody = Awaited<ReturnType<typeof parseBody<typeof schema>>>;

/** העבודה עצמה. זורק ApiError/LlmError; הקורא כותב את התוצאה ל-job. */
async function runGeneration(body: GenerateBody, runId: string, jobId: string) {
  const startedAt = Date.now();
  let persisted = false;
  /** ההרצה שנרשמה אחרונה — זו שכשל מאוחר (מסגור/ולידציה/שמירה) שייך אליה. */
  let lastAttemptId = runId;
  let designId: string | null = null;
  let userPrompt: string | null = null;
  /** הרפרנס האנושי לעיצוב. נשמר בחוץ כי ההתראה על כשל נשלחת מה-catch. */
  let designRef: string | null = null;
  /** מה שנשלח למודל ומה שקבע אותו — נשמר ליומן גם כשההרצה נכשלה. */
  let runLog: Pick<PersistRunInput, "renderPrompt" | "inputs" | "inputImage"> | null = null;

  try {
    designId = body.designId;
    userPrompt = body.userPrompt;
    const design = await getDesign(body.designId);
    designRef = designSampleCode(design);

    // תמונת השראה (אם צורפה) משמשת רפרנס למודל התמונה. סוג המדיה כבר אומת ב-POST.
    //
    // הראשונה בלבד, ורק `inspiration`: למודל התמונה יש מקום לתמונת ייחוס אחת,
    // ותמונת `annotation` נבדקת ונזרקת (ראה AnnotationToolbar — השכבה מוסתרת עד
    // שתחובר). הלולאה שהייתה כאן עברה על **כל** התמונות ופענחה כל אחת מהן
    // במלואה כדי לקרוא את סוג המדיה שלה — כולל אלה שממילא לא ייקראו.
    const first = body.images.find((img) => img.kind === "inspiration");
    let inspiration: LlmImage | null = first
      ? {
          mediaType: dataUrlMediaType(first.dataUrl) as LlmImage["mediaType"],
          base64: first.dataUrl.slice(first.dataUrl.indexOf(",") + 1),
        }
      : null;

    // 1) התכנון. כמה הדמיות, ובאיזו פריסה, נגזר מהיחס שהוזמן: מודל התמונה לא
    // מצייר יחס שמבקשים ממנו אלא נמשך ליחס נוח לו, וצורת הקנבס היא מה שמזיז
    // אותו. כל שורה היא גם מועמד לבחירת הלקוחה. הנימוקים והמדידות:
    // src/lib/render/panels.ts.
    const dims = {
      lengthMm: Number(design.length_mm),
      widthMm: Number(design.width_mm),
      thicknessMm: Number(design.thickness_mm),
    };
    //
    // עריכה (currentSvg קיים): הפריט הקיים נמסר למודל כתמונה, ולכן הפרומפט
    // מדבר על התמונה המצורפת ולא מתאר פריט חדש. **התכנון זהה** ליצירה מאפס:
    // רפרנס ושורות דוחפים לאותו יחס, לא זה נגד זה, ואין סיבה לוותר על אחד מהם.
    // עד 30.7 עריכה קיבלה שורה אחת בארבע קריאות — נימוק שלא נמדד מעולם, ופי
    // ארבעה בעלות מול הצינור החדש (~$0.006 להרצה).
    const fab = resolveFab(dims.thicknessMm, design.product_type);
    const minHoleMm = fab.minHole;
    // צורת הקנבס נגזרת מהאורך, לא מהעדפה: בפס שבו הפריט קצר מכדי לבקש שורות
    // בקנבס לרוחב וארוך מכדי לקבל עמודה שנייה, קנבס לאורך הוא הידית היחידה.
    // היא נבחרת כאן, לפני תמונת הבסיס: תמונת הייחוס חייבת להצטייר על אותו קנבס
    // שיתבקש מהמודל — ייחוס לרוחב מול קנבס לאורך מחזיר פריט חתוך בקצוות.
    const canvas = canvasFor(dims.lengthMm);
    const editSvg = buildBaseRenderSvg(body.currentSvg, canvas);
    // מספר הגרסה שנמסרה כבסיס. שאילתה נוספת אחת לכל עריכה, ורק כדי שהיומן
    // יידע *על מה* השינוי נשלח. שדה יומן לא מפיל הרצה: כשל כאן משאיר אותו ריק.
    const baseVersionNo = editSvg && body.baseVersionId
      ? await getVersion(body.baseVersionId)
          .then((v) => (v.design_id === design.id ? v.version_no : undefined))
          .catch(() => undefined)
      : undefined;
    // עקיפת הכיול נוגעת בשורות בלבד; העמודות נשארות 1 כדי שהניסוי יהיה על
    // משתנה אחד — ומספר החלופות שווה למספר השורות, כמו לפני שהיו עמודות.
    const plan: RenderPlan = body.rowsOverride
      ? {
          rows: body.rowsOverride,
          cols: 1,
          calls: 1 as const,
          candidates: body.rowsOverride,
          // גם מהמעבדה: מייצרים כמה שביקשו, ומציעים את מה שהמסך מציג.
          offered: Math.min(body.rowsOverride, MAX_CANDIDATES),
          canvas,
        }
      : planRender({ ratio: dims.lengthMm / dims.widthMm, widthMm: dims.widthMm, minHoleMm, canvas });

    // הכיתוב נחתך אצלנו ונמסר כתמונת ייחוס — **רק ביצירה מאפס**. בעריכה
    // תמונת הייחוס היא כבר העיצוב הקיים, והכיתוב יושב בתוכו; שתי תמונות אין
    // לאן לשלוח, ועדיף לשמר את מה שעל המסך.
    const lettering = editSvg || !body.text?.trim()
      ? null
      : await buildLetteringRenderSvg(
          body.text, dims, design.product_type, plan.rows, body.userPrompt, plan.cols, canvas,
        );
    if (!editSvg && body.text?.trim() && !lettering) {
      throw new ApiError(
        "text_too_long",
        `הכיתוב "${body.text.trim()}" ארוך מדי לפריט בגודל הזה — נסו טקסט קצר יותר.`,
        400,
      );
    }
    const baseSvg = editSvg ?? lettering?.svg ?? null;
    // למודל התמונה יש מקום לתמונת ייחוס אחת (`_reference` בקופסה בוחר את
    // base_svg על פני ההשראה). כשיש כיתוב הוא זה שנוסע — הוא ההבטחה הקשיחה
    // ללקוחה, וההשראה היא רוח שאפשר לתאר במילים. נאפס אותה כאן ולא נשאיר
    // ליומן דיווח על תמונה שלא נשלחה.
    /** התמונה שהמשתמשת צירפה ונזרקה, ולמה. ריק = לא נזרקה. */
    let imageDropped: "lettering" | "edit" | null = null;
    if (inspiration && (lettering || editSvg)) {
      imageDropped = lettering ? "lettering" : "edit";
      inspiration = null;
    }
    // הפרומפט מהבק־אופיס נשלח **כמו שהוא**. שים לב שמשפט ה-LAYOUT יושב בתוכו,
    // ומספר השורות שחותך בפועל הוא `plan.rows` — אם הם סותרים, הקופסה תחתוך
    // לפי plan.rows. זה מכוון (אפשר לנסות ניסוח מול חיתוך אחר), והמסך מציג את
    // המספר שיחתוך ליד התיבה כדי שהסתירה תהיה גלויה.
    // story mode — במסלול Story אין רוחב שנבחר, ולכן הפרומפט מוסר טווח במקום
    // מידה. `undefined` בכל מסלול אחר = הפסקה נבנית בדיוק כמו קודם.
    const story = isStory(body.mode);
    const prompt =
      body.promptOverride?.trim() ||
      buildRenderPrompt(
        body.userPrompt, design.product_type, dims, plan.rows,
        Boolean(editSvg), Boolean(lettering), plan.cols,
        story ? { widthRange: widthRangeOf(design.product_type) } : undefined,
      );

    // מה שהיומן צריך כדי להסביר את התוצאה: הפרומפט שיצא בפועל, והמאפיינים
    // שבנו אותו. הוא נבנה כאן ולא בתוך persistRun כדי ששתי הקריאות — ההצלחה
    // והכשל שבתפיסה למטה — ידווחו בדיוק את אותו דבר.
    runLog = {
      renderPrompt: prompt,
      inputs: {
        productType: design.product_type,
        lengthMm: dims.lengthMm,
        widthMm: dims.widthMm,
        thicknessMm: dims.thicknessMm,
        rows: plan.rows,
        cols: plan.cols,
        calls: plan.calls,
        /** צורת הקנבס שנשלחה בפועל. בלי זה אי אפשר להעמיד ביומן הרצה בפס
         *  מול הרצה מחוצה לו — ושתיהן נראות זהות בכל שדה אחר. */
        canvasSize: sizeParam(canvas),
        /**
         * מה שהוזמן מול מה שהתא שנבחר מסוגל לתת. שניהם ידועים כאן, לפני
         * שהמודל רץ, ושניהם נשמרים — הפער ביניהם הוא כל מה שהמסגור ייאלץ
         * למתוח אחר כך. ב-AP-0096: 29.04 מול 8.63.
         */
        orderedRatio: Math.round((dims.lengthMm / dims.widthMm) * 100) / 100,
        plannedRatio: Math.round(NATURAL_RATIO(plan.rows, plan.cols, canvas) * 100) / 100,
        minHoleMm,
        colorKey: "dark",
        imageCount: body.images.length,
        /**
         * התמונה צורפה ולא נשלחה, וזו הסיבה.
         *
         * למודל התמונה יש מקום לתמונת ייחוס אחת, וכיתוב או עריכה תופסים אותה.
         * עד כאן זה קרה בשקט: `imageCount: 1` בלי תמונת קלט ובלי ייחוס — מצב
         * שנראה ביומן בדיוק כמו כשל בהעלאה. "צירפתי תמונה והמודל התעלם ממנה"
         * לא היה ניתן לאבחון, וזו הייתה תלונה אמיתית.
         */
        imageDropped: imageDropped ?? undefined,
        // האם ההרצה יצאה מהעיצוב הקיים או מאפס. בלי זה אי אפשר להבחין ביומן
        // בין עריכה שלא שימרה את הבסיס לבין יצירה חדשה שכך התבקשה.
        editedFromCurrent: Boolean(editSvg),
        editedFromVersion: baseVersionNo,
        /** הכיתוב שנחתך, והטיפוגרפיה שכל שורה קיבלה. בלי זה אי אפשר להסביר
         *  ביומן למה חלופה אחת נראית אחרת מהשנייה.
         *
         *  השדות נבחרים אחד-אחד ולא נשפכים: `LetteringRow` נושאת גם את
         *  הפוליגונים של האותיות, וזו גאומטריה במשקל של עשרות קילובייט
         *  לשורה. שורת יומן היא דיווח, לא עותק. */
        lettering: lettering
          ? {
              text: body.text?.trim(),
              rows: lettering.rows.map((r) => ({
                fontId: r.fontId,
                letterHeightMm: r.letterHeightMm,
                textWidthMm: r.textWidthMm,
                /** הגשרים שנחתכו — ראה RunInputs. תיבת החלל מצטמצמת למספר
                 *  אחד (המידה לרוחב הגשר), כי זה מה שמעמידים מול הרוחב. */
                bridges: r.bridges.map((b) => ({
                  char: b.char,
                  widthMm: Math.round(b.widthMm * 100) / 100,
                  counterMm: Math.round(
                    (b.sideways ? b.counter[3] - b.counter[1] : b.counter[2] - b.counter[0]) * 100,
                  ) / 100,
                  sideways: b.sideways,
                })),
              })),
            }
          : null,
        /** ההרצה הגיעה ממסך הכיול עם פרומפט שנכתב ידנית. */
        promptOverride: Boolean(body.promptOverride?.trim()),
        // story mode — כדי שאפשר יהיה למדוד את הניסוי ביומן מול המסלול הרגיל.
        mode: story ? STORY_MODE : undefined,
      },
      // ה-base64 שכבר בידנו, לא בייטים: כאן נבנה קודם data URL חדש בשרשור
      // (עותק שלישי של המטען) רק כדי לפרק אותו מיד, והבייטים שיצאו הוחזקו עד
      // סוף ההרצה למרות ש-`persistRun` צריכה אותם לרגע ההעלאה בלבד.
      inputImage: inspiration
        ? { base64: inspiration.base64, mediaType: inspiration.mediaType }
        : null,
    };

    const RANK = { pass: 0, warn: 1, fail: 2 } as const;
    // הכיתוב **אינו** נדרס אחרי שהמודל מחזיר. היה כאן שלב שהחליף את מה
    // שהמודל צייר בנתיבי הפונט המקוריים, והוא הוסר (החלטת גל, 31/07): המודל
    // מדויק ב-3 מתוך 4 חלופות, הלקוחה בוחרת ומאשרת בעצמה, והעיצוב שהיא
    // רואה הוא זה שנחתך — בלי שכבה שמדביקה אותיות על גביו. המחיר מוצג לה
    // במפורש בשדה הכיתוב (`textVerify`): לוודא את האיות לפני הזמנה.
    // המדידות ששני הכיוונים נשענים עליהן: docs/research/HEBREW_TEXT_LETTERING_FIELD.md §6.8.
    const bridgePlan = { letterBridges: lettering?.rows.flatMap((r) => r.bridges) };

    // 2)–4) הרצה אחת של המחצית היקרה: רנדר בקופסה, רישום ליומן, מסגור ודירוג.
    // מוגדרת כפונקציה כי היא עשויה לרוץ פעמיים — ראה `MAX_RENDER_ATTEMPTS`.
    // `log` הוא `runLog` בקבוע, כדי שהסגור לא יצטרך להתמודד עם `let` שיכול
    // להתאפס: כאן הוא כבר נבנה, וזה מה שנרשם בכל ניסיון.
    const log = runLog;
    const attemptOnce = async (attemptId: string, attemptNo: number) => {
      lastAttemptId = attemptId;
      // הנתיבים שהקופסה תכתוב אליהם. אנחנו חותמים כתובת העלאה לכל אחד; הבייטים
      // עצמם לא עוברים כאן. "coverage" קורא את צבע הרקע משולי התמונה ואת צבע
      // המתכת מהפיקסלים הרחוקים ממנו, ולכן הוא לא תלוי בכך שהמודל ציית
      // לפרומפט — מה שנכשל בפועל, ובעקבותיו החזרנו הדמיה מוצללת שסף גלובלי
      // יחיד עיגל למתכת.
      //
      // הנתיבים נגזרים מ-`attemptId` בלבד: הוא כבר שונה בין הניסיונות (זו
      // הסיבה שהייתה כאן חותמת זמן — ניסיון שני שכותב לאותם קבצים מוחק את
      // הראיות של הראשון), והוא **יציב** בין בקשה לבקשה. בקשה שמתחדשת אחרי
      // ניתוק מצביעה בזכות זה על ההדמיות שכבר הועלו, במקום להעלות עותק שני
      // לצד שם שאיש כבר לא יידע לקשר.
      const renderPaths = Array.from({ length: plan.calls }, (_, i) => `renders/${design.id}/${attemptId}-${i}.png`);
      const stagePaths = {
        // מה שהמודל באמת ראה. בלי זה אפשר רק לשחזר אותו מהקוד, וזו טענה אחרת.
        reference: `runs/${attemptId}/reference.png`,
        conditioned: `runs/${attemptId}/conditioned.png`,
        overlay: `runs/${attemptId}/overlay.png`,
        difference: `runs/${attemptId}/difference.png`,
        rendered: `runs/${attemptId}/rendered.png`,
      };
      const job = await runRenderJob({
        jobId: attemptId,
        prompt,
        calls: plan.calls,
        rows: plan.rows,
        size: sizeParam(canvas),
        cols: plan.cols,
        heightMm: dims.widthMm,
        colorKey: "coverage",
        // הפתח המינימלי נגזר כאן ונשלח כמספר: חוקי הייצור נשארים במקום אחד, והקופסה
        // מיישמת אותם. בלי זה שערה של 0.17 מ"מ שהטרייסר משאיר לצד עלה נכנסת ל-SVG
        // ופוסלת את כל הפס ב-V5 — פתח שאי אפשר לחתוך ממילא.
        minHoleMm,
        inspiration,
        baseSvg,
        // הרצה עם כיתוב רצה על מודל אחר — ראה LETTERING_MODEL. שאר ההרצות
        // נשארות על ברירת המחדל הזולה.
        model: lettering ? LETTERING_MODEL : undefined,
        renderPaths,
        stagePaths,
        // הרגע שבו ההרצה מפסיקה להיות תלויה בבקשה הזו: הקופסה קיבלה אותה,
        // המזהה שלה ידוע, ומכאן היא ניתנת לאיסוף גם אם ה-isolate ימות בדקה
        // הבאה. מה שנשמר הוא כל מה שדרוש כדי **לסיים** — ראה runs/complete.
        onOpen: (boxJobId) =>
          setJobContext(jobId, runId, {
            boxJobId,
            attemptId,
            designId: design.id,
            renderPaths,
            stagePaths,
            userPrompt: body.userPrompt,
            renderPrompt: prompt,
            inputs: { ...log.inputs, plannedCandidates: plan.candidates, attempt: attemptNo },
            bridges: bridgePlan.letterBridges ?? [],
            tightShare: lettering?.tightShare ?? null,
            startedAt,
          } satisfies JobContext),
      });
      const renderPngPath = job.renderPaths[0] ?? null;

      // 3) שומרים את ההרצה ליומן *לפני* שמחליטים — כך גם דחיות נשמרות לאבחון.
      await persistRun({
        id: attemptId,
        source: "studio",
        designId: design.id,
        productType: design.product_type,
        prompt: body.userPrompt,
        colorKey: "coverage",
        startedAt,
        render: { path: renderPngPath, model: job.model },
        stagePaths: job.stagePaths,
        vectorizer: job.raw,
        ...log,
        inputs: {
          ...log.inputs,
          // נכתב כאן ולא למעלה: המספר השני ידוע רק אחרי שהקופסה ענתה. פער בין
          // השניים אומר שהמודל לא צייר את הרשת שהתבקשה.
          plannedCandidates: plan.candidates,
          deliveredPanels: job.candidates.length,
          offeredPanels: plan.offered,
          attempt: attemptNo,
          // מה שהמודל **באמת** צייר, מול מה שהוזמן. נגזר מה-SVG שנשמר על
          // השורה עצמה (`raw.cutouts_svg`, ראה persistRun), כדי שהמספר
          // והתמונה ביומן יתארו את אותו דבר.
          ...(ratioGap(job.raw.cutouts_svg as string | undefined, dims) ?? {}),
        },
      });
      persisted = true;

      // הרנדר מאחורינו; מכאן זה מסגור, ולידציה ושמירה. הלקוחה רואה את המעבר.
      await setJobStage(jobId, runId, "saving");

      // 4) מסגור כל מועמד למידה שהוזמנה, ודירוג: קודם מה שעובר ולידציה, ואז מי
      // שנמתח הכי פחות — כלומר מי שהמודל צייר הכי קרוב ליחס האמיתי.
      //
      // המסגור עצמו כבר לא רץ כאן אלא ב-Worker נפרד (src/lib/render/frameClient).
      // תקרת ה-128MB היא לכל isolate ומשותפת לכל הבקשות שרצות בו, ומסגור הוא
      // המקצה הגדול ביותר בבקשה — 45.1MB בתום הקריאה על ארבעה מועמדים אמיתיים
      // לפני שהפסקנו להחזיק את `normalized`, 16.5MB אחרי. ה-isolate הזה נהרג
      // על זיכרון בבקשה יחידה (reqs=1), ולכן מה שנשאר להוציא הוא המקצה עצמו,
      // לא ההחזקה שלו. מכאן ה-isolate של האתר ממסגר פעם אחת בלבד — את הזוכה,
      // בתוך ingestCutouts, שגוזר את הגאומטריה שלו ממילא מחדש.
      const approved = job.candidates.filter((c) => c.status === "approved" && c.cutoutsSvg);
      // מייצרים לפי היחס, מציגים עד `offered` (11.8). כשהתמונה נחתכה ליותר
      // פסים ממה שמציגים, הנבחרים הם הקרובים ביותר ליחס שהוזמן — כלומר אלה
      // שיצטרכו את המתיחה הקטנה ביותר. הבחירה על ה-viewBox בלבד, לפני המסגור:
      // מסגור של עשרים־וחמישה מועמדים הוא בדיוק ההקצאה שהוצאה מה-isolate.
      const shortlist = pickClosestRatio(approved, (c) => c.cutoutsSvg, dims, plan.offered);
      // story mode — כל מועמד ממוסגר **למידות של עצמו**: האורך שהוזמן, והרוחב
      // שקנה מידה אחיד מייצר עבור הציור הזה (בתוך טווח הייצור). מכאן המסגור
      // הקיים בוחר את הרוחב האחיד מעצמו ו-`stretch` חוזר 1 — בלי שום שינוי
      // בקוד הגיאומטרי ובלי דגל שנוסע לשירות המסגור. ראה lib/story/mode.ts.
      //
      // הקריאה נשארת `frameCandidates`, מועמד בכל פעם: הפונקציה ממסגרת סדרתית
      // ממילא (מועמד אחד חי בכל רגע — ראה frameClient), וכך גם הנפילה־לאחור
      // בין הקופסה, ה-Worker והמסלול המקומי נשארת זהה לשני המסלולים.
      const ranked = (
        story
          ? await shortlist.reduce<Promise<FramedPreview[]>>(async (acc, c) => {
              const out = await acc;
              const svg = c.cutoutsSvg!;
              out.push(...(await frameCandidates(storyFrameDims(designDims(design), svg), [svg], bridgePlan)));
              return out;
            }, Promise.resolve([]))
          : await frameCandidates(designDims(design), shortlist.map((c) => c.cutoutsSvg!), bridgePlan)
      ).sort((a, b) => RANK[a.report.status] - RANK[b.report.status] || Math.abs(a.stretch - 1) - Math.abs(b.stretch - 1));
      // story mode — ואחרי הדירוג, סדר שמראה את השונות. ההצעה הראשונה נשארת
      // מי שהייתה (היא זו שנשמרת כגרסה); מה שמשתנה הוא הסדר של השאר, כדי
      // ששתי ההצעות הראשונות שהלקוחה רואה לא יהיו הדומות ביותר זו לזו.
      // ראה orderByVariety.
      const framed = story ? orderByVariety(ranked) : ranked;
      return { job, renderPngPath, framed };
    };

    // הרנדר חזר ואף מועמד לא עבר — ניסיון שני, אחד בלבד (החלטת גל, 3.8.26).
    //
    // **למה דווקא כאן ולא על כל כשל.** הדחייה הזו היא היחידה בצינור שהיא באמת
    // מקרית: אותו פרומפט בדיוק, אותן מידות, והפעם המודל צייר משהו שהמעקב הצליח
    // לקרוא. דחיית מסנן תוכן (`content_blocked`) ומידה בלתי אפשרית (`bad_size`)
    // הן דטרמיניסטיות — ניסיון שני מחזיר בהן את אותה תשובה בכסף כפול, ולכן הן
    // נופלות מ-`attemptOnce` החוצה ולא מגיעות לכאן בכלל.
    //
    // המחיר גלוי: קריאה שנייה למודל התמונה (~$0.006, ~$0.021 עם כיתוב), שתי
    // שורות ביומן עם `attempt: 1|2`, ועוד ~30 שניות המתנה ללקוחה. מה שהוא קונה
    // הוא שהיא לא רואה שגיאה על כשל שסיבוב נוסף היה פותר.
    let { job, renderPngPath, framed: candidates } = await attemptOnce(runId, 1);
    let generationId = runId;
    if (candidates.length === 0 && Date.now() - startedAt < RETRY_DEADLINE_MS) {
      // מזהה שני: שתי ההרצות נשמרות ביומן, ואף אחת מהן לא דורסת את השנייה.
      // נגזר ולא מוגרל, מאותה סיבה כמו הראשון — בקשה שמתחדשת חייבת לחזור
      // בדיוק לשני ה-jobs שכבר שולמו, ולא לפתוח שלישי.
      const retryId = await deriveAttemptId(jobId, 2);
      const second = await attemptOnce(retryId, 2);
      // גם אם השני נכשל אף הוא — הוא התשובה העדכנית, וההדמיה שלו היא זו
      // שהשגיאה מתארת.
      ({ job, renderPngPath, framed: candidates } = second);
      generationId = retryId;
    }

    if (candidates.length === 0) {
      const status = String((job.raw as { status?: string }).status ?? "no candidate");
      throw new ApiError("vectorize_failed", `Vectorizer did not approve any panel: ${status}`, 422);
    }

    // כל תמונה שהמודל מייצר מקבלת מספר עיצוב משלה (החלטת גל, 10.8). בקשת
    // שינוי לא כותבת גרסה שנייה על העיצוב הקיים אלא נשמרת כ**דוגמה** ממוספרת
    // שלו — `AP-0085.2` — כך שהמספר שמוסרים בטלפון מצביע לעולם על צורה אחת,
    // והנקודה בקוד היא האינדיקציה לעיצוב שממנו נגזרה. הדוגמה נוצרת רק אחרי
    // שידוע שיש מה לשמור — כשל לא משאיר עיצוב ריק ברשימה. היצירה הראשונה
    // נשארת על העיצוב שנפתח בשבילה.
    const target = editSvg ? await createSampleDesign(design) : design;

    // story mode — הרוחב של הזוכה הוא הרוחב של העיצוב מכאן והלאה.
    //
    // הוא נקרא מה-viewBox של המועמד שנבחר ולא מחושב מחדש: זו המסגרת שהוא באמת
    // יושב בה אחרי המסגור. הרשומה מתעדכנת כדי שכל מה שבא אחרי — בקשת שינוי,
    // מעבר בין הצעות, ההזמנה והבק־אופיס — ידבר על אותו רוחב, ו-`ingested`
    // נושא אותו כבר עכשיו כדי שהמסגור של הזוכה יהיה זהות ולא מתיחה שנייה.
    const storyWidthMm = story ? svgFrame(candidates[0].framedSvg)?.widthMm ?? null : null;
    const ingestTarget =
      storyWidthMm !== null ? { ...target, width_mm: storyWidthMm } : target;
    if (storyWidthMm !== null) await updateDesignWidth(target.id, storyWidthMm);

    // 5) הטוב ביותר נשמר כגרסה; השאר חוזרים לבחירת הלקוחה — אבל רק אלה שאפשר
    // לייצר. הצעה שנכשלה בוולידציה אינה בחירה אלא מלכודת: היא נראית ככל השאר,
    // הלקוחה תבחר בה כי היא יפה, והמסע ייעצר בייצוא. אם *כל* המועמדים נכשלו
    // הרשימה מתרוקנת והמסך מציג את הגרסה השמורה עם הסיבה שאי אפשר לייצר אותה.
    const offered = candidates.filter((c) => c.report.status !== "fail");
    const raw = (job.raw as { metrics?: Record<string, number> }).metrics;
    const metrics = {
      iou: raw?.iou,
      holes: raw?.vector_holes,
      meanDeviationMm: raw?.mean_contour_deviation_mm,
      maxDeviationMm: raw?.max_contour_deviation_mm,
    };
    // ההצעות נשמרות על הגרסה עצמה (0012). עד כאן הן חזרו בגוף התשובה בלבד,
    // כלומר חיו רק בזיכרון הדפדפן ונמחקו בכל רענון.
    const offeredRows = offered.map((c) => ({
      svg: c.framedSvg,
      report: c.report,
      drawnRatio: Math.round(c.drawnRatio * 100) / 100,
      stretch: Math.round(c.stretch * 1000) / 1000,
      // הגישור הוא החלטה שמשנה את הצורה, והיא מתקבלת לכל מועמד בנפרד. עד כאן
      // היא שרדה רק אצל הזוכה (`validation_report.bridges` של הגרסה השמורה),
      // ולכן שלוש החלופות האחרות הוצגו ביומן בלי שום דרך לדעת מה תוקן בהן.
      bridges: c.bridges,
    }));
    const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
      design: ingestTarget,
      cutoutsSvg: candidates[0].framedSvg,
      userPrompt: body.userPrompt,
      renderPngPath,
      metrics,
      candidates: offeredRows,
      // ההרצה שהמועמדים האלה באו ממנה — לא בהכרח `runId`, אם הניסיון השני הוא
      // זה שהצליח. הקיבוץ ביומן הגרסאות נשען על זה.
      generationId,
      // הגשרים של הכיתוב נחתכים מהפונט אצלנו, לפני שהמודל צייר משהו, ולכן הם
      // אינם נגזרים מה-SVG שהוולידציה בודקת. בלי זה הלקוחה מקבלת פריט שדורש
      // בדיקה בלי לדעת על כך.
      extraChecks: letteringBridgeCheck(lettering?.tightShare ?? null),
      // הגשרים שחתכנו בכיתוב. אם המודל לא צייר אותם, המסגור מחזיר אותם
      // למקומם במקום למחוק את החלל — ראה geometry/restoreBridges.
      bridgePlan,
      // candidates ממוין כך שהזוכה ראשון, ו-offered שומר על הסדר — הגרסה
      // שנשמרת כאן היא ההצעה הראשונה, אלא אם היא נפלה בוולידציה ואינה מוצעת.
      pickedIndex: offeredRows.length > 0 && offered[0] === candidates[0] ? 0 : null,
    });

    // ההדמיה חוזרת כקישור חתום ולא כ-data URL. ה-PNG שוקל ~2.3MB, כלומר ~3.1MB
    // בבסיס64 — פי עשרה משאר התשובה, ומסע היצירה של הלקוחה אפילו לא קורא אותו
    // (רק טאב הרנדר בסטודיו). תשובה כבדה על חיבור אטי נקטעת, וה-client מתרגם
    // גוף לא־תקין לשגיאה כללית — "היצירה נכשלה" על הרצה שהצליחה בשרת.
    const renderUrl = renderPngPath ? await signedUrl(renderPngPath, 3600).catch(() => null) : null;

    return {
      runId,
      version,
      report,
      geometry,
      lengthMm,
      widthMm,
      candidates: offeredRows,
      render: { model: job.model, url: renderUrl },
      vectorizer: metrics,
      // העיצוב שהגרסה נשמרה עליו. ביצירה זה העיצוב שנפתח; בעריכה — הדוגמה
      // החדשה, והלקוח צריך את המספר שלה כדי שהזמנה ושיתוף יצביעו נכון.
      design: {
        id: target.id,
        serial: target.serial,
        root_serial: target.root_serial,
        sample_no: target.sample_no,
      },
    };
  } catch (err) {
    // אם עוד לא שמרנו הרצה (כשל מוקדם — שירות הרנדר לא זמין, מודל התמונה) — נרשום שגיאה.
    if (!persisted) {
      await persistRun({
        id: runId,
        source: "studio",
        designId,
        prompt: userPrompt,
        colorKey: "coverage",
        startedAt,
        // עם הקוד, כמו בכל שאר הכתיבות ליומן: `internal` ו-`vectorize_failed`
        // הם ההבדל בין תקלה אצלנו לדחייה של הצינור, וההודעה לבדה מוחקת אותו.
        error: describeFailure(err),
        vectorizer: null,
        ...(runLog ?? {}),
      });
    } else {
      // ההרצה כבר נרשמה — עם הסטטוס של הווקטורייזר — וכשל **אחרי** הרישום
      // (מסגור, ולידציה, שמירת הגרסה) השאיר אותה נראית תקינה בזמן שהמשתמש
      // קיבל 500: היומן ענה "אין שגיאה" על יצירה שנכשלה (אוגוסט 2026), והכשל
      // האמיתי חי רק על שורת ה-job, שאינה מוצגת כשיש הרצה.
      //
      // **בלי החרגה של כשלים מוכרים.** עד 11.8 `ApiError`/`LlmError` דולגו
      // כאן, בהנחה שהם "מספרים את הסיפור שלהם" — אבל הם מספרים אותו ללקוחה
      // ולשורת ה-job, לא ליומן. AP-0096 הוא המדידה: המסגור חזר מה-Worker
      // כ-`ApiError` עם `internal`, שלוש הרצות רצופות נרשמו "approved · אין
      // שגיאה", אף אחת מהן לא הולידה גרסה, והלקוחה לא ראתה כלום. הקוד נכתב
      // לצד ההודעה כדי שהשורה תגיד את אותו דבר שה-job אומר.
      await markRunError(lastAttemptId, describeFailure(err));
    }
    // כשל שיכול להיות מערכתי וחוזר = תקלה שפוגעת בכולם, לא לקוח בודד. ההזעקה
    // יוצאת מהכשל השני בחלון — ב-10.8 זה היה מקצר תקלה של ארבע שעות לדקות.
    // עד 11.8 השער היה `!(err instanceof ApiError)` — וכשל מסודר כמו
    // `render_failed` (למשל 401 גורף מהקופסה) לא הזעיק איש למרות שהפיל את
    // כולם. הקריטריון המלא, כולל מה מוחרג ולמה: `isSystemicFailure`.
    if (isSystemicFailure(err)) {
      await alertUnexpectedFailure(err, { runId: lastAttemptId, designRef });
    }
    // תקציב שנגמר אצל ספק התמונות משבית את היצירה לכולם עד שמישהו מוסיף תקציב,
    // ואי אפשר לגלות אותו מהאתר. ההתראה נשלחת אחרי כתיבת השורה ליומן, כדי
    // שהמייל והיומן יספרו את אותו סיפור — ולא מפילה את הכשל המקורי.
    if (isQuotaFailure(err)) {
      await alertQuotaExhausted(err, { runId, designRef, startedAt });
    }
    throw err;
  }
}
