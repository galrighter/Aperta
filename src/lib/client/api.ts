import { he } from "@/i18n/he";
import type { Account, Design, Geometry, Profile, Version } from "./types";
import type { ValidationReport } from "@/lib/geometry/types";

// שכבת הקריאות לשרת. כל השגיאות מתורגמות ל-Error עם הודעה בעברית + code.

export class ClientApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ClientApiError("network", he.errNetwork, 0);
  }
  let body: unknown = null;
  let parseFailed = false;
  try {
    body = await res.json();
  } catch {
    // גוף לא־תקין. על תשובת שגיאה זה צפוי (יש קוד סטטוס); על 200 זו תשובה
    // שנקטעה — ובלי הבחנה כאן היא הוחזרה כ-null, והקורא נפל על TypeError
    // מאוחר יותר עם "משהו השתבש" שאי אפשר לאבחן ממנו כלום.
    parseFailed = true;
  }
  if (res.ok && parseFailed) {
    throw new ClientApiError("truncated", he.errNetwork, res.status);
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    throw new ClientApiError(err?.code ?? "unknown", messageFor(err?.code ?? "unknown"), res.status);
  }
  return body as T;
}

/** קוד שגיאה -> נוסח לעברית. משותף לתשובת שגיאה ולכישלון שמדווח בגוף של job. */
function messageFor(code: string): string {
  if (code === "rate_limited") return he.errRateLimit;
  if (code === "network") return he.errNetwork;
  if (code === "llm_error") return he.errLlmNotSvg;
  // דחיית ווקטורייזר היא תוצאה לגיטימית ולא תקלה — הרנדר לא עבר את שערי
  // הנאמנות. עד כה היא הוצגה כ"משהו השתבש", ולכן נראתה כמו באג במערכת.
  if (code === "vectorize_failed") return he.errVectorizeFailed;
  if (code === "account_required") return he.errAccountRequired;
  // תקציב שנגמר אצל ספק התמונות: לא באג ולא משהו שהלקוחה יכולה לתקן בניסוח
  // אחר. "משהו השתבש. נסו שוב" שולח אותה לנסות שוב לתוך אותו קיר בדיוק.
  if (code === "quota_exhausted") return he.errQuotaExhausted;
  // מיגרציה שלא רצה. נוסח משלה, כי "משהו השתבש" שולח לחפש באג בקוד בזמן
  // שמה שצריך הוא להריץ את המיגרציה בייצור.
  if (code === "schema_outdated") return he.errSchemaOutdated;
  return he.errGeneric;
}

export interface GenerationResult {
  version: Version;
  report: ValidationReport;
  geometry: Geometry | null;
  lengthMm?: number;
  widthMm?: number;
  /** הצעות נוספות מאותה יצירה, מדורגות. הראשונה היא הגרסה שנשמרה. */
  candidates?: Array<{ svg: string; report: ValidationReport; drawnRatio: number; stretch: number }>;
  render?: { model: string; url: string | null };
}

/** כמה זמן לחכות בין משיכות. היצירה לוקחת ~30-90 שניות, אז שנייה וחצי היא
 *  עדכון מהיר מספיק לעין ורחוק מספיק כדי לא להציף. */
const POLL_MS = 1500;
/** גבול בטיחות ללולאה, בנפרד מגבול ה"נתקע" שהשרת אוכף. */
const POLL_TIMEOUT_MS = 8 * 60_000;
/** כמה לחפש תוצאה אחרי שהבקשה עצמה נכשלה. קצר: מי שהיה אמור לכתוב אותה כבר מת. */
const RECOVERY_WINDOW_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * פותחת בקשת יצירה ומחכה לתוצאה. ההרצה נמשכת ~30-90 שניות והשרת מחזיר אותה
 * בתוך אותה בקשה. אם הרשת נופלת באמצע, המזהה שנוצר כאן מאפשר לשאול על השורה
 * במקום להניח שההרצה אבדה.
 *
 * שגיאת רשת בזמן משיכה אינה כישלון של היצירה — ממשיכים לנסות עד הגבול.
 */
/**
 * האם כדאי לשאול על ההרצה למרות שהבקשה נכשלה.
 *
 * status 0 — הבקשה לא קיבלה תשובה בכלל.
 * 5xx בלי קוד שגיאה של האפליקציה — התשובה לא הגיעה מהקוד שלנו: ה-isolate של
 * Cloudflare נהרג. זה קורה *אחרי* שהצינור סיים (נמדד: הרצה שנרשמה approved
 * אחרי 41 שניות, בזמן שהלקוחה קיבלה 503 בלי גוף), וכיוון ש-finishJob נכתב לפני
 * שהתשובה נשלחת — התוצאה כבר בשורה. לזרוק כאן פירושו למחוק יצירה שהצליחה.
 *
 * truncated — 200 שגופו נקטע. ההרצה הצליחה; רק המשלוח לא שרד.
 *
 * 4xx, או 5xx עם קוד — זו תשובה אמיתית של השרת. אין מה לשאול.
 */
function mayHaveSurvived(e: ClientApiError): boolean {
  if (e.status === 0 || e.code === "truncated") return true;
  return e.status >= 500 && e.code === "unknown";
}

async function startAndAwaitGeneration(
  input: {
    designId: string;
    userPrompt: string;
    /** הכיתוב על התכשיט. השרת חותך אותו מהפונט ומוסר אותו למודל כתמונה. */
    text?: string;
    currentSvg: string | null;
    images: Array<{ kind: "inspiration" | "annotation"; dataUrl: string }>;
  },
  onStage?: (stage: string | null) => void,
  /** המזהה, ברגע שנקבע — כדי שהקורא יוכל לזכור אותו ולמצוא את התוצאה אחר כך. */
  onJob?: (jobId: string) => void,
): Promise<GenerationResult> {
  // המזהה נקבע כאן ולא בשרת: אם הבקשה עצמה תיקטע, הוא מה שמאפשר לחזור ולשאול
  // מה עלה בגורל ההרצה במקום להניח שאבדה.
  const jobId = crypto.randomUUID();
  onJob?.(jobId);
  let started: { jobId?: string } & Partial<GenerationResult>;
  try {
    started = await call<{ jobId?: string } & Partial<GenerationResult>>("/api/generate", {
      method: "POST",
      body: JSON.stringify({ ...input, jobId }),
    });
  } catch (e) {
    if (!(e instanceof ClientApiError) || !mayHaveSurvived(e)) throw e;
    // ההרצה אולי הצליחה בשרת; שואלים על השורה במקום להכריז על אובדן. אם אין
    // שם כלום, pollJob נכשל בעצמו ומחזיר את השגיאה — אבל לא לפני שבדק.
    // חלון קצר בכוונה: אם ה-isolate מת, אף אחד כבר לא יכתוב לשורה, ואין טעם
    // להחזיק ספינר עד שהיא תיחשב תקועה. או שהתוצאה שם עכשיו, או שאין.
    try {
      return await pollJob(jobId, onStage, RECOVERY_WINDOW_MS);
    } catch {
      throw e;
    }
  }
  // השרת מריץ בתוך הבקשה ומחזיר את התוצאה. 202 עם מזהה הוא מסלול ישן/חלופי.
  if (!started.jobId) return started as GenerationResult;
  // במסלול הזה המזהה הוא של השרת. בפועל הוא שווה לשלנו (הוא מקבל אותו בגוף),
  // אבל אם ייבדל — מי שזוכר אותו צריך לדעת על מה באמת לשאול.
  if (started.jobId !== jobId) onJob?.(started.jobId);
  return pollJob(started.jobId, onStage);
}

/** מושכת את מצב ההרצה עד לתוצאה. */
async function pollJob(
  jobId: string,
  onStage?: (stage: string | null) => void,
  windowMs = POLL_TIMEOUT_MS,
): Promise<GenerationResult> {
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    let state: { status: string; stage?: string | null; result?: GenerationResult; error?: { code?: string } };
    try {
      state = await call(`/api/generate/${jobId}`);
    } catch (e) {
      // 404 אומר שהמזהה לא קיים — אין טעם להמשיך. כל השאר (רשת, 5xx חולף)
      // הוא כשל של המשיכה, לא של היצירה, והעבודה ממשיכה בשרת בלי קשר.
      if (e instanceof ClientApiError && e.status === 404) throw e;
      continue;
    }
    if (state.status === "done" && state.result) {
      onStage?.(null);
      return state.result;
    }
    if (state.status === "error") {
      const code = state.error?.code ?? "unknown";
      throw new ClientApiError(code, messageFor(code), 500);
    }
    onStage?.(state.stage ?? null);
  }
  throw new ClientApiError("timeout", he.errGeneric, 504);
}

export const api = {
  profiles: () => call<{ profiles: Profile[] }>("/api/profiles"),

  /** מי מחובר עכשיו בדפדפן הזה. null = טרם נרשם. */
  account: () => call<{ account: Account | null }>("/api/account"),

  /** השלמת שם/טלפון אחרי הכניסה הראשונה. הזהות כבר מאומתת — אין כאן הרשמה.
   *  (הכניסה עצמה עוברת ישירות מול Supabase Auth, ראו client/supabaseBrowser.) */
  updateAccount: (input: { name?: string; phone?: string }) =>
    call<{ account: Account }>("/api/account", { method: "PATCH", body: JSON.stringify(input) }),

  signOut: () => call<{ ok: true }>("/api/account", { method: "DELETE" }),

  designs: (profileId: string) =>
    call<{ designs: Design[] }>(`/api/designs?profileId=${encodeURIComponent(profileId)}`),

  /** העיצובים של החשבון המחובר — בלי פרמטר, הבעלות מהעוגייה. */
  myDesigns: () => call<{ designs: Design[] }>("/api/designs"),

  // בלי profileId: הבעלות נקבעת בשרת מהעוגייה של החשבון. הסטודיו הפנימי
  // עדיין שולח profileId של בודק — ראו את ההערה בסכימה של המסלול.
  createDesign: (input: { profileId?: string; productType: "bracelet" | "ring"; name?: string }) =>
    call<{ design: Design }>("/api/designs", { method: "POST", body: JSON.stringify(input) }),

  getDesign: (id: string) =>
    call<{ design: Design; currentVersion: Version | null; versions: Version[] }>(`/api/designs/${id}`),

  patchDesign: (id: string, patch: Record<string, unknown>) =>
    call<{ design: Design }>(`/api/designs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteDesign: (id: string) => call<{ ok: true }>(`/api/designs/${id}`, { method: "DELETE" }),

  duplicateDesign: (id: string) =>
    call<{ design: Design }>(`/api/designs/${id}/duplicate`, { method: "POST" }),

  generate: (
    input: {
      designId: string;
      userPrompt: string;
      text?: string;
      currentSvg: string | null;
      /** הגרסה ש-`currentSvg` נלקח ממנה — נרשמת ביומן הבק־אופיס. */
      baseVersionId?: string;
      images: Array<{ kind: "inspiration" | "annotation"; dataUrl: string }>;
    },
    onStage?: (stage: string | null) => void,
    onJob?: (jobId: string) => void,
  ) => startAndAwaitGeneration(input, onStage, onJob),

  /** מצב הרצה לפי מזהה — למי שחזר אחרי שיצא מהמסך באמצע היצירה. */
  job: (jobId: string) =>
    call<{
      status: "running" | "done" | "error";
      stage?: string | null;
      result?: GenerationResult;
      error?: { code?: string; message?: string };
    }>(`/api/generate/${jobId}`),

  chooseCandidate: (designId: string, svg: string, index?: number) =>
    call<{
      version: Version;
      report: ValidationReport;
      geometry: Geometry | null;
      lengthMm: number;
      widthMm: number;
    }>(`/api/designs/${designId}/choose`, { method: "POST", body: JSON.stringify({ svg, index }) }),

  vectorize: (input: {
    designId: string;
    image: { dataUrl: string };
    colorKey?: "coverage" | "warm" | "dark" | "saturation" | "auto";
  }) =>
    call<{
      version: Version;
      report: ValidationReport;
      geometry: Geometry | null;
      lengthMm: number;
      vectorizer: { iou?: number; holes?: number; meanDeviationMm?: number };
    }>("/api/vectorize", { method: "POST", body: JSON.stringify(input) }),

  validate: (input: {
    svg: string;
    productType: "bracelet" | "ring";
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  }) =>
    call<{ report: ValidationReport; canonicalSvg: string | null; geometry: Geometry | null }>(
      "/api/validate",
      { method: "POST", body: JSON.stringify(input) },
    ),

  exportDesign: (versionId: string, forced: boolean) =>
    call<{ dxfUrl: string; svgUrl: string }>("/api/export", {
      method: "POST",
      body: JSON.stringify({ versionId, forced }),
    }),
};
