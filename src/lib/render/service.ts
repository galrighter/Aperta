import { ApiError } from "@/lib/api";
import { signedUploadUrl } from "@/lib/db/storage";
import { deriveRenderJobId } from "./attemptId";
import { vectorizerUrl } from "@/lib/site.config";
import type { LlmImage } from "@/lib/llm/core";
import type { RunStagePaths } from "@/lib/db/runs";

// הלקוח לשירות היצירה שרץ על הקופסה (אותו שירות שמריץ את ה-vectorizer).
//
// למה זה שם ולא כאן: פס ביחס נמוך מתוכנן לארבע הדמיות, וארבעה PNG של 1536x1024
// שמפוענחים, נחתכים ונכתבים מחדש ב-JS — עם ארבעה payloads של debug שנשמרים
// במלואם — עוברים את מה ש-isolate של Cloudflare רשאי לצרוך (128MB ותקרת CPU
// קשיחה). ההרצה נהרגה *אחרי* שהצינור כבר הצליח, והלקוחה קיבלה 503 בלי גוף.
//
// מה שנשאר כאן: התכנון (כמה שורות, כמה קריאות), בניית הפרומפט — שנושא את
// מינימומי הייצור מ-resolveFab() — והפסיקה אם מועמד בר-ייצור. מנוע הגיאומטריה
// לא מהגר: עותק שני של חוקי הייצור בפייתון הוא בדיוק מה שנסחף.

const RENDER_TIMEOUT_MS = 240_000;

/** כמה זמן להמתין לתשובה על בקשה *בודדת* אל הקופסה במסלול המוחזק. הפתיחה
 *  והסקירה שתיהן קצרות — העבודה עצמה כבר לא רצה בתוך אף אחת מהן. */
const CALL_TIMEOUT_MS = 30_000;
/**
 * הסקירה מתחילה צפופה ומתרחבת, במקום קצב קבוע.
 *
 * למה: כל סקירה היא תת-בקשה של אותה הפעלת Worker, ו-Cloudflare קוצב תת-בקשות
 * להפעלה. קצב קבוע של 2ש׳ לאורך עד 240ש׳ הוא עד 120 סקירות — ויצירה איטית
 * חצתה את המכסה באמצע ונפלה עם "Too many subrequests" (11.8; ההרצות המהירות
 * עברו, ולכן זה נראה כתקלה לסירוגין). ההתחלה הצפופה שומרת על תגובתיות בהרצות
 * הקצרות — רובן נגמרות תוך דקה — וההרחבה עד 15ש׳ תוחמת הרצה איטית בכ-11
 * סקירות במקום 60. המחיר: איחור זיהוי סיום של עד 15ש׳ בזנב של הרצה ארוכה,
 * זניח מול יצירה שנכשלת.
 */
const POLL_INTERVAL_MS = 2_000;
const POLL_INTERVAL_MAX_MS = 15_000;
const POLL_BACKOFF = 1.5;

/**
 * ניסיון חוזר אחד, ורק על כשל שקרה *מיד*. כשל מהיר פירושו שהחיבור לא נוצר כלל
 * — הקופסה מתרוממת מחדש (דיפלוי, קונטיינר שקם) — ואז אף קריאה למודל התמונה לא
 * יצאה, ואין מה לשלם עליו פעמיים. כשל אחרי דקות הוא ניתוק באמצע הרצה שאולי כבר
 * רצה, ושם ניסיון חוזר קונה סבב הדמיות שני בכסף אמיתי.
 */
const FAST_FAILURE_MS = 5_000;
const RETRY_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * דחייה של מסנן התוכן, ולא כשל של המודל.
 *
 * הקופסה מעבירה את גוף ה-400 של OpenAI כמות שהוא בתוך הודעת RENDER_FAILED
 * (`vectorizer/app/imagegen.py`), ולכן הזיהוי נעשה כאן — ובלי לחכות לפריסה
 * שלה. **ההבחנה אינה קוסמטית**: כשל רגיל של מודל התמונה הוא מקרי וניסיון חוזר
 * מתקן אותו, ודחיית מסנן היא דטרמיניסטית — אותו תיאור ייחסם שוב ושוב. נמדד
 * ב-AP-0077 (3.8.26): ארבע הרצות של "עיטורי מיקי מאוס" חזרו כולן ב-400
 * `rejected by the safety system`, והלקוח קיבל בכל אחת מהן הזמנה לנסות שוב.
 */
export function isContentBlock(message: string): boolean {
  return /safety system|content[_ ]?policy|moderation_blocked|content[_ ]?filter/i.test(message);
}

export interface RenderCandidate {
  panel: number;
  status: string;
  cutoutsSvg: string | null;
  widthMm: number;
}

export interface RenderJob {
  model: string;
  panels: number;
  candidates: RenderCandidate[];
  /** נתיבי ההדמיות שבאמת הועלו — רק הם נרשמים ליומן. */
  renderPaths: string[];
  stagePaths: RunStagePaths;
  /** התשובה הגולמית של הפאנל שנבחר (status/metrics/debug) — כמו שהיומן מצפה. */
  raw: Record<string, unknown>;
  /**
   * המזהה שתחתיו הקופסה מחזיקה את ההרצה הזו.
   *
   * הוא נגזר מהבקשה **ומתוכנה** (ראה `deriveRenderJobId`), ולכן אי אפשר לחשב
   * אותו מחדש בלי לשחזר את הבקשה בייט-בייט — כולל תמונת ההשראה, שאינה נשמרת
   * אצלנו בגודלה. לכן הוא מוחזר: מי שרוצה לאסוף את ההרצה אחר כך שומר אותו,
   * וזה כל מה שהוא צריך (`collectRenderJob`).
   *
   * `null` במסלול הישן, שבו הקופסה מריצה בתוך הבקשה ולא מחזיקה כלום.
   */
  boxJobId: string | null;
}

interface RawCandidate {
  panel?: number;
  status?: string;
  cutouts_svg?: string | null;
  width_mm?: number;
}

interface RawJob {
  model?: string;
  panels?: number;
  candidates?: RawCandidate[];
  uploaded_renders?: number[];
  uploaded_stages?: string[];
  /** המסלול המוחזק בלבד: "running" | "done" | "error". */
  state?: string;
  /** המסלול המוחזק בלבד: התוצאה, כשהיא מוכנה. */
  result?: unknown;
  [k: string]: unknown;
}

async function readBody(resp: Response): Promise<RawJob> {
  const text = await resp.text();
  try {
    return JSON.parse(text) as RawJob;
  } catch {
    // גוף שאינו JSON כאן הוא כמעט תמיד עמוד שגיאה של שער בדרך ולא תשובה של
    // הקופסה — ולכן ההודעה אומרת את זה, במקום להיראות כמו באג בשירות.
    throw new ApiError(
      "render_bad_response",
      `Render service returned non-JSON (${resp.status}), i.e. a gateway error and not the service itself: ${text.slice(0, 300)}`,
      502,
    );
  }
}

export interface RenderJobInput {
  prompt: string;
  calls: number;
  rows: number;
  /** עמודות בתמונה. הקופסה חותכת רשת rows×cols; 1 = טור אחד, כמו קודם. */
  cols: number;
  /** צורת הקנבס לבקש מהמודל, `"1536x1024"`. `undefined` = ברירת המחדל של
   *  הקופסה, שהיא לרוחב — מה שכל הרצה קיבלה עד היום. */
  size?: string;
  /** רוחב הפס שהוזמן — ממנו הווקטורייזר גוזר את הסקאלה. */
  heightMm: number;
  colorKey: "coverage" | "warm" | "dark" | "saturation" | "auto";
  /** הפתח המינימלי לייצור. חוקי הייצור נשארים כאן — הקופסה רק מיישמת את המספר,
   *  ומשמיטה פתחים שהלייזר לא יכול לפתוח לפני שהם מגיעים ל-SVG. */
  minHoleMm: number;
  inspiration: LlmImage | null;
  /** עריכה: העיצוב הקיים כ-SVG שהקופסה מרסטרת (resvg) ומוסרת למודל התמונה
   *  כרפרנס. גובר על `inspiration` — זה הפריט עצמו ולא השראה. בנייה:
   *  src/lib/render/baseImage.ts. */
  baseSvg: string | null;
  /**
   * איזה מודל תמונה לרנדר איתו. `undefined` = ברירת המחדל של הקופסה
   * (`gpt-image-1-mini`). הבחירה מתקבלת ב-forme ולא בקופסה, כי הסיבה לה חיה
   * כאן — ראה LETTERING_MODEL ב-lib/llm/imagegen.ts.
   */
  model?: string;
  /** לאן ייכתבו ההדמיות ותמונות השלבים. אנחנו חותמים, השירות כותב. */
  renderPaths: string[];
  stagePaths: RunStagePaths;
  /**
   * המזהה שתחתיו הקופסה מחזיקה את ההרצה — נגזר מ-`jobId` של הלקוחה
   * (`render/attemptId.ts`). איתו הבקשה חוזרת ואוספת תוצאה שכבר שולמה במקום
   * להזמין רנדר שני; בלעדיו הקופסה מריצה בתוך הבקשה כמו קודם.
   */
  jobId?: string;
  /**
   * נקרא ברגע שהקופסה קיבלה את ההרצה והחלה לעבוד, עם המזהה שתחתיו היא מחזיקה
   * אותה.
   *
   * **למה כאן ולא בתשובה.** המזהה חוזר גם ב-`RenderJob`, אבל זה מאוחר מדי לצורך
   * שבשבילו הוא נשמר: רנדר לוקח 30–90 שניות, וה-isolate יכול למות באמצעם. מי
   * שרוצה שההרצה תהיה ניתנת לאיסוף גם אז חייב את המזהה **בזמן** שהיא רצה, לא
   * אחריה. כשל בשמירה אינו מפיל את ההרצה — היא ממשיכה, פשוט בלי רשת.
   */
  onOpen?: (boxJobId: string) => Promise<void> | void;
}

const STAGE_KEYS = ["reference", "conditioned", "overlay", "difference", "rendered"] as const;

export async function runRenderJob(input: RenderJobInput): Promise<RenderJob> {
  // כתובת חתומה לכל נתיב. שמונה חתימות בסך הכול — הרבה מתחת לתקרת ה-subrequests,
  // ובלי אף בייט של תמונה שעובר דרכנו.
  const renderUrls = await Promise.all(input.renderPaths.map((p) => signedUploadUrl(p)));
  const stageUrls: Record<string, string> = {};
  for (const key of STAGE_KEYS) {
    const path = input.stagePaths[key];
    if (path) stageUrls[key] = await signedUploadUrl(path);
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.VECTORIZER_API_TOKEN) headers.authorization = `Bearer ${process.env.VECTORIZER_API_TOKEN}`;

  const request = {
    prompt: input.prompt,
    calls: input.calls,
    rows: input.rows,
    cols: input.cols,
    // הקופסה נופלת חזרה ללרוחב על ערך שאינה מכירה, ולכן גרסה ישנה שלה מתעלמת
    // מהשדה במקום להיכשל עליו. זו רשת ביטחון בלבד — המתג באפליקציה הוא
    // מה שמונע את המצב הזה מלכתחילה.
    size: input.size ?? null,
    height_mm: input.heightMm,
    color_key: input.colorKey,
    min_hole_mm: input.minHoleMm,
    inspiration: input.inspiration
      ? { media_type: input.inspiration.mediaType, base64: input.inspiration.base64 }
      : null,
    base_svg: input.baseSvg,
    model: input.model ?? null,
  };

  // המזהה שתחתיו הקופסה מחזיקה את ההרצה. הוא נגזר גם מהבקשה עצמה — הכתובות
  // החתומות בחוץ, כי הן נחתמות מחדש בכל קריאה ואינן משנות מה ייווצר. בקשה
  // שהשתנתה היא job אחר; בקשה זהה חוזרת לאותו job ולא משלמת עליו שוב.
  const boxJobId = input.jobId ? await deriveRenderJobId(input.jobId, JSON.stringify(request)) : null;
  // בלי מזהה הקופסה מריצה בתוך הבקשה ומחזירה את התוצאה — המסלול הישן, שנשאר
  // כדי שגרסה של הקופסה שקדמה לשינוי עדיין תעבוד.
  const payload = JSON.stringify({
    ...request,
    job_id: boxJobId,
    artifacts: { renders: renderUrls, stages: stageUrls },
  });

  // המסלול הישן מחזיק את הבקשה פתוחה לכל אורך ההרצה; המוחזק פותח ואז סוקר,
  // ולכן כל קריאה בו קצרה.
  const callTimeout = boxJobId ? CALL_TIMEOUT_MS : RENDER_TIMEOUT_MS;
  const post = () =>
    fetch(`${vectorizerUrl()}/api/generate`, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(callTimeout),
    });

  let resp: Response;
  const sentAt = Date.now();
  try {
    resp = await post();
  } catch (e) {
    if (Date.now() - sentAt > FAST_FAILURE_MS) {
      throw new ApiError("render_unreachable", `Could not reach the render service: ${(e as Error).message}`, 502);
    }
    await sleep(RETRY_DELAY_MS);
    try {
      resp = await post();
    } catch (again) {
      throw new ApiError(
        "render_unreachable",
        `Could not reach the render service, twice: ${(again as Error).message}`,
        502,
      );
    }
  }

  let body = await readBody(resp);

  // 202 = הקופסה קיבלה את ההרצה ומחזיקה אותה. מכאן זו סקירה, וניתוק כאן כבר
  // לא מאבד את העבודה: היא ממשיכה שם, והבקשה הבאה עם אותו jobId תאסוף אותה.
  if (boxJobId && resp.status === 202) {
    // ההרצה בידי הקופסה, והמזהה שלה ידוע — מכאן היא ניתנת לאיסוף גם אם מי
    // שפתח אותה ימות בדקה הבאה. הכשלה כאן לא מפילה את ההרצה עצמה.
    if (input.onOpen) {
      try {
        await input.onOpen(boxJobId);
      } catch (e) {
        console.error("could not record the render job id:", (e as Error).message);
      }
    }
    const deadline = sentAt + RENDER_TIMEOUT_MS;
    const statusUrl = `${vectorizerUrl()}/api/generate/${encodeURIComponent(boxJobId)}`;
    let pollDelay = POLL_INTERVAL_MS;
    while (body.state === "running") {
      if (Date.now() >= deadline) {
        throw new ApiError(
          "render_timeout",
          `The render service is still working after ${Math.round(RENDER_TIMEOUT_MS / 1000)}s`,
          504,
        );
      }
      await sleep(pollDelay);
      pollDelay = Math.min(pollDelay * POLL_BACKOFF, POLL_INTERVAL_MAX_MS);
      // כשל רשת בסקירה אינו כשל של ההרצה — היא ממשיכה על הקופסה. שואלים שוב.
      let poll: Response;
      try {
        poll = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      } catch {
        continue;
      }
      if (poll.status === 404) {
        // הקופסה קמה מחדש ואיבדה את ההרצה שבאוויר. אין מה לאסוף.
        throw new ApiError("render_lost", "The render service forgot this run (it restarted)", 502);
      }
      resp = poll;
      body = await readBody(poll);
    }
  }

  if (!resp.ok) {
    // כשל מודל התמונה מגיע כ-RENDER_FAILED; הלקוחה רואה את ההודעה של llm_error.
    // תקציב שנגמר אצל ספק התמונות הוא סיבה בפני עצמה: אין מה לנסות שוב, וזו
    // ההרצה היחידה שדורשת שמישהו יידע עליה — ראה alerts/quota בנתיב היצירה.
    const detail = (body as { detail?: { error_code?: string; message?: string } }).detail;
    const message = detail?.message ?? "";
    const code =
      detail?.error_code === "QUOTA_EXHAUSTED"
        ? "quota_exhausted"
        // הקופסה מלאה. שום דבר לא נשבר ושום דבר לא שולם — ולכן זו לא "היצירה
        // נכשלה" אלא בקשה לנסות עוד רגע, וזה מה שהלקוחה צריכה לקרוא.
        : detail?.error_code === "BUSY"
          ? "render_busy"
        : detail?.error_code === "RENDER_FAILED"
          ? isContentBlock(message) ? "content_blocked" : "llm_error"
          : "render_failed";
    throw new ApiError(code, detail?.message ?? `Render service failed (${resp.status})`, 502);
  }

  // במסלול המוחזק התוצאה עטופה ב-`result`; במסלול הישן היא הגוף עצמו. אותה
  // תוצאה בדיוק — הקורא לא אמור לדעת באיזה מסלול היא הגיעה.
  if (body.state === "done" && body.result) body = body.result as RawJob;

  return toRenderJob(body, input.renderPaths, input.stagePaths, boxJobId);
}

/**
 * ההרצה שהקופסה כבר סיימה, לפי המזהה שלה בלבד.
 *
 * זה הצד השני של C2 (docs/C2_RESILIENT_GENERATION.md): הבקשה שפתחה את ההרצה
 * יכולה למות, והעבודה היקרה — שכבר שולמה — ממשיכה ונשמרת שם. `runRenderJob`
 * אוסף אותה בדרך אחת בלבד: לשלוח שוב את **אותה בקשה בדיוק**, כי המזהה נגזר
 * מתוכנה. זה מתאים למי שהגוף עדיין בידה, ולא למי שמסיימת הרצה של מישהי אחרת
 * — שם תמונת ההשראה כבר לא קיימת בשום מקום שאפשר לשחזר ממנו בייט-בייט.
 *
 * כאן ההצבעה ישירה: המזהה נשמר בשורת ההרצה, ואיתו נאספת התוצאה בלי הבקשה.
 *
 * `null` = הקופסה לא מכירה את המזהה. זה קורה כשהיא קמה מחדש (התוצאה נכתבת
 * לדיסק בסיום, והרצה שהייתה באוויר נעלמת) או אחרי ה-TTL. לא שגיאה — תשובה.
 */
export async function collectRenderJob(
  boxJobId: string,
  renderPaths: string[],
  stagePaths: RunStagePaths,
): Promise<RenderJob | null> {
  const headers: Record<string, string> = {};
  if (process.env.VECTORIZER_TOKEN) headers.authorization = `Bearer ${process.env.VECTORIZER_TOKEN}`;
  const url = `${vectorizerUrl()}/api/generate/${encodeURIComponent(boxJobId)}`;

  let resp: Response;
  try {
    resp = await fetch(url, { headers, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } catch (e) {
    throw new ApiError("render_unreachable", `Could not reach the render service: ${(e as Error).message}`, 502);
  }
  // 404 = נשכחה. אין מה לאסוף, ואין כאן שגיאה לדווח עליה — הקורא יחליט אם
  // להריץ מחדש. כל שאר הכשלים הם תקלה שכן צריך לראות.
  if (resp.status === 404) return null;
  const body = await readBody(resp);
  if (!resp.ok) {
    const detail = (body as { detail?: { message?: string } }).detail;
    throw new ApiError("render_failed", detail?.message ?? `Render service failed (${resp.status})`, 502);
  }
  // עדיין רצה — לא נשלים אותה עכשיו, וגם לא נכריז עליה כאבודה.
  if (body.state === "running") return null;
  const done = body.state === "done" && body.result ? (body.result as RawJob) : body;
  return toRenderJob(done, renderPaths, stagePaths, boxJobId);
}

/** התשובה הגולמית של הקופסה → `RenderJob`. משותפת לפתיחה ולאיסוף. */
function toRenderJob(
  body: RawJob,
  renderPaths: string[],
  stagePaths: RunStagePaths,
  boxJobId: string | null,
): RenderJob {
  const uploadedRenders = new Set(body.uploaded_renders ?? []);
  const uploadedStages = new Set(body.uploaded_stages ?? []);
  const uploaded: RunStagePaths = {};
  for (const key of STAGE_KEYS) {
    const path = stagePaths[key];
    if (path && uploadedStages.has(key)) uploaded[key] = path;
  }

  return {
    model: body.model ?? "unknown",
    panels: body.panels ?? 0,
    renderPaths: renderPaths.filter((_, i) => uploadedRenders.has(i)),
    stagePaths: uploaded,
    candidates: (body.candidates ?? []).map((c, i) => ({
      panel: c.panel ?? i,
      status: c.status ?? "unknown",
      cutoutsSvg: c.cutouts_svg ?? null,
      widthMm: Number(c.width_mm ?? 0),
    })),
    raw: body as Record<string, unknown>,
    boxJobId,
  };
}
