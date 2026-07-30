import { ApiError } from "@/lib/api";
import { signedUploadUrl } from "@/lib/db/storage";
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

/**
 * ניסיון חוזר אחד, ורק על כשל שקרה *מיד*. כשל מהיר פירושו שהחיבור לא נוצר כלל
 * — הקופסה מתרוממת מחדש (דיפלוי, קונטיינר שקם) — ואז אף קריאה למודל התמונה לא
 * יצאה, ואין מה לשלם עליו פעמיים. כשל אחרי דקות הוא ניתוק באמצע הרצה שאולי כבר
 * רצה, ושם ניסיון חוזר קונה סבב הדמיות שני בכסף אמיתי.
 */
const FAST_FAILURE_MS = 5_000;
const RETRY_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function serviceUrl(): string {
  return process.env.VECTORIZER_URL || "https://vec.rmjewel.com";
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
  [k: string]: unknown;
}

export interface RenderJobInput {
  prompt: string;
  calls: number;
  rows: number;
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
  /** לאן ייכתבו ההדמיות ותמונות השלבים. אנחנו חותמים, השירות כותב. */
  renderPaths: string[];
  stagePaths: RunStagePaths;
}

const STAGE_KEYS = ["conditioned", "overlay", "difference", "rendered"] as const;

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
  if (process.env.VECTORIZER_TOKEN) headers.authorization = `Bearer ${process.env.VECTORIZER_TOKEN}`;

  const payload = JSON.stringify({
    prompt: input.prompt,
    calls: input.calls,
    rows: input.rows,
    height_mm: input.heightMm,
    color_key: input.colorKey,
    min_hole_mm: input.minHoleMm,
    inspiration: input.inspiration
      ? { media_type: input.inspiration.mediaType, base64: input.inspiration.base64 }
      : null,
    base_svg: input.baseSvg,
    artifacts: { renders: renderUrls, stages: stageUrls },
  });
  const post = () =>
    fetch(`${serviceUrl()}/api/generate`, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
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

  const text = await resp.text();
  let body: RawJob;
  try {
    body = JSON.parse(text) as RawJob;
  } catch {
    // גוף שאינו JSON כאן הוא כמעט תמיד עמוד שגיאה של שער בדרך ולא תשובה של
    // הקופסה — ולכן ההודעה אומרת את זה, במקום להיראות כמו באג בשירות.
    throw new ApiError(
      "render_bad_response",
      `Render service returned non-JSON (${resp.status}), i.e. a gateway error and not the service itself: ${text.slice(0, 300)}`,
      502,
    );
  }
  if (!resp.ok) {
    // כשל מודל התמונה מגיע כ-RENDER_FAILED; הלקוחה רואה את ההודעה של llm_error.
    // תקציב שנגמר אצל ספק התמונות הוא סיבה בפני עצמה: אין מה לנסות שוב, וזו
    // ההרצה היחידה שדורשת שמישהו יידע עליה — ראה alerts/quota בנתיב היצירה.
    const detail = (body as { detail?: { error_code?: string; message?: string } }).detail;
    const code =
      detail?.error_code === "QUOTA_EXHAUSTED"
        ? "quota_exhausted"
        : detail?.error_code === "RENDER_FAILED"
          ? "llm_error"
          : "render_failed";
    throw new ApiError(code, detail?.message ?? `Render service failed (${resp.status})`, 502);
  }

  const uploadedRenders = new Set(body.uploaded_renders ?? []);
  const uploadedStages = new Set(body.uploaded_stages ?? []);
  const stagePaths: RunStagePaths = {};
  for (const key of STAGE_KEYS) {
    const path = input.stagePaths[key];
    if (path && uploadedStages.has(key)) stagePaths[key] = path;
  }

  return {
    model: body.model ?? "unknown",
    panels: body.panels ?? 0,
    renderPaths: input.renderPaths.filter((_, i) => uploadedRenders.has(i)),
    stagePaths,
    candidates: (body.candidates ?? []).map((c, i) => ({
      panel: c.panel ?? i,
      status: c.status ?? "unknown",
      cutoutsSvg: c.cutouts_svg ?? null,
      widthMm: Number(c.width_mm ?? 0),
    })),
    raw: body as Record<string, unknown>,
  };
}
