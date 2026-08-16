import { he } from "@/i18n/he";
import type { Account, Design, Geometry, Profile, Version } from "./types";
import type { DesignPreview } from "@/lib/designPreview";
import type { Price } from "@/lib/pricing";
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
  // דחיית מסנן התוכן של מודל התמונה. נוסח משלה כי היא **דטרמיניסטית**: אותו
  // תיאור ייחסם גם בניסיון הבא, ולכן "נסו שוב" הוא בדיוק העצה הלא נכונה.
  if (code === "content_blocked") return he.errContentBlocked;
  // מידה שאי אפשר לייצר לפיה. הפעולה היא חזרה למסך המידות, לא ניסיון חוזר.
  if (code === "bad_size") return he.errBadSize;
  // דחיית ווקטורייזר היא תוצאה לגיטימית ולא תקלה — הרנדר לא עבר את שערי
  // הנאמנות. עד כה היא הוצגה כ"משהו השתבש", ולכן נראתה כמו באג במערכת.
  if (code === "vectorize_failed") return he.errVectorizeFailed;
  if (code === "account_required") return he.errAccountRequired;
  // תקציב שנגמר אצל ספק התמונות: לא באג ולא משהו שהלקוחה יכולה לתקן בניסוח
  // אחר. "משהו השתבש. נסו שוב" שולח אותה לנסות שוב לתוך אותו קיר בדיוק.
  if (code === "quota_exhausted") return he.errQuotaExhausted;
  // הקופסה מלאה — לא כשל אלא תור. זו אחת השגיאות הבודדות שבהן ניסיון חוזר
  // מיידי הוא באמת מה שצריך לעשות, ולכן היא לא נבלעת ב"משהו השתבש".
  if (code === "render_busy") return he.errRenderBusy;
  // מיגרציה שלא רצה. נוסח משלה, כי "משהו השתבש" שולח לחפש באג בקוד בזמן
  // שמה שצריך הוא להריץ את המיגרציה בייצור.
  if (code === "schema_outdated") return he.errSchemaOutdated;
  // ההרצה הפסיקה להגיב — ה-isolate מת בלי לכתוב כלום. עד שההמתנה אחרי ניתוק
  // התארכה עד ההכרעה, הלקוחה כמעט לא הגיעה לכאן: החלון הקצר החזיר לה שגיאת
  // רשת הרבה קודם. עכשיו זה המסלול, ומגיע לו נוסח שאומר מה קרה.
  if (code === "job_stalled") return he.errJobStalled;
  // הרצה נטושה שנסגרה בלי גרסה, כי הרצה מאוחרת יותר על אותו עיצוב כבר
  // הסתיימה. הלקוחה מגיעה לכאן רק כשהיא פותחת מחדש הרצה ישנה שנשמרה בדפדפן.
  if (code === "job_superseded") return he.errJobSuperseded;
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
  /**
   * העיצוב שהגרסה נשמרה עליו. ביצירה — העיצוב שנפתח; בעריכה — דוגמה ממוספרת
   * חדשה (`AP-0085.2`): כל תמונה מהמודל מקבלת מספר משלה (החלטת גל, 10.8).
   * חסר בתשובת שרת ישן — ואז הגרסה יושבת על העיצוב הנוכחי, כמו קודם.
   */
  design?: { id: string; serial: number | null; root_serial: number | null; sample_no: number | null };
}

/** כמה זמן לחכות בין משיכות. היצירה לוקחת ~30-90 שניות, אז שנייה וחצי היא
 *  עדכון מהיר מספיק לעין ורחוק מספיק כדי לא להציף. */
const POLL_MS = 1500;
/**
 * גבול בטיחות ללולאה, בנפרד מגבול ה"נתקע" שהשרת אוכף.
 *
 * הוא **לא** אמור להיות זה שמכריע: השרת מכריז `job_stalled` אחרי שש דקות
 * (`JOB_STALE_MS`), וזו ההכרעה הנכונה — היא נשענת על השורה, לא על ניחוש
 * מהדפדפן. השתיים כאן הן המרווח שמעליה.
 */
const POLL_TIMEOUT_MS = 8 * 60_000;

/**
 * המצב שהלקוחה נכנסת אליו כשהבקשה נקטעה וההרצה עדיין באוויר.
 *
 * לא `stage` של השרת אלא של הדפדפן, ולכן הוא נבדל בשם: השרת מדווח
 * `rendering`/`saving`, וזה מדווח "אני כבר לא מחוברת אליו ואני מחכה לשורה".
 */
export const DISCONNECTED_STAGE = "disconnected";

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
 * אחרי 41 שניות, בזמן שהלקוחה קיבלה 503 בלי גוף), וכיוון שהסגירה נכתבת לפני
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
    /**
     * מזהה של הרצה שנקטעה, כשמנסים אותה **שוב עם אותו קלט**.
     *
     * הקופסה מחזיקה את ההרצה תחת מזהה שנגזר מזה, ולכן ניסיון חוזר עם המזהה
     * הישן אוסף את מה שכבר רונדר במקום לשלם עליו שוב (ראה
     * docs/C2_RESILIENT_GENERATION.md). קלט שהשתנה מקבל ממילא הרצה חדשה —
     * השרת גוזר את מזהה הקופסה גם מהבקשה עצמה — כך שמיחזור בטעות לא יחזיר
     * ללקוחה ציור שלא ביקשה.
     */
    jobId?: string;
    /** story mode — נמסר לשרת כמות שהוא. ריק = ההתנהגות הקיימת. */
    mode?: "story";
  },
  onStage?: (stage: string | null) => void,
  /** המזהה, ברגע שנקבע — כדי שהקורא יוכל לזכור אותו ולמצוא את התוצאה אחר כך. */
  onJob?: (jobId: string) => void,
): Promise<GenerationResult> {
  // המזהה נקבע כאן ולא בשרת: אם הבקשה עצמה תיקטע, הוא מה שמאפשר לחזור ולשאול
  // מה עלה בגורל ההרצה במקום להניח שאבדה.
  const jobId = input.jobId ?? crypto.randomUUID();
  onJob?.(jobId);

  /* ===== המשמר: השורה נשאלת **במקביל** לבקשה, לא רק אחריה =====

     הבקשה היא זו שמריצה, אבל **השורה** היא זו שיודעת איך ההרצה נגמרה — והיא
     היחידה מבין השתיים ששורדת את מות הבקשה. עד כאן היא נשאלה רק כשהבקשה
     *נכשלה*, כלומר כשהדפדפן קיבל שגיאה. מה שאין לזה כיסוי הוא בקשה שלא חוזרת
     **ולא נכשלת**: isolate שנהרג באמצע שליחת התשובה, proxy שמנתק בלי לסגור,
     לשונית במובייל שהסוקט שלה מת בשקט. `fetch` פשוט אינו נפתר לעולם, ואף אחד
     מהמסלולים למטה לא רץ.

     נמדד על עיצוב 165 (14.8): מסך ההמתנה נשאר מסתובב בזמן שההרצה הסתיימה,
     נשמרה, ואפילו שלחה את מייל "העיצוב שלך מוכן" — הלקוח נכנס דרך המייל אל
     העיצוב שהמסך שלו טען שעדיין נוצר.

     מכאן המשמר רץ מהרגע שהמזהה נקבע. מי שמגיע ראשון להכרעה הוא התשובה, ואין
     מצב שבו שתיהן שותקות. בונוס שאינו במקרה: `onStage` מקבל עכשיו את שלב
     ההרצה האמיתי (`rendering` → `saving`) לאורך המסלול התקין — עד כה הוא לא
     נקרא שם אפילו פעם אחת. */

  /** הבקשה עדיין באוויר, ולכן 404 מהשורה הוא "עוד לא נוצרה" ולא "אינה קיימת". */
  let requestOpen = true;
  /** ההכרעה כבר נפלה; אין למי לסקור. */
  let decided = false;

  const watched = pollJob(jobId, onStage, POLL_TIMEOUT_MS, {
    unborn: () => requestOpen,
    cancelled: () => decided,
  });
  // ההכרעה של המשמר נקראת למטה בשני מסלולים; זה רק מונע unhandled rejection
  // במסלול שבו הבקשה הקדימה אותו.
  watched.catch(() => {});

  type Settled =
    | { via: "request"; body: { jobId?: string } & Partial<GenerationResult> }
    | { via: "job"; result: GenerationResult };

  const requested: Promise<Settled> = call<{ jobId?: string } & Partial<GenerationResult>>(
    "/api/generate",
    { method: "POST", body: JSON.stringify({ ...input, jobId }) },
  ).then(
    (body) => {
      requestOpen = false;
      return { via: "request", body } as Settled;
    },
    (e) => {
      requestOpen = false;
      if (!(e instanceof ClientApiError) || !mayHaveSurvived(e)) throw e;
      // ההרצה עדיין באוויר; ההכרעה עוברת כולה לשורה.
      //
      // **עד מתי — וכמה זמן זה היה שבור.** כאן היה חלון של 12 שניות, בנימוק
      // ש"אם ה-isolate מת אף אחד כבר לא יכתוב לשורה". הנימוק נכון למקרה אחד
      // ולא נכון לשכיח: ניתוק **אצל הלקוחה** — 4G שנופל, מסך שננעל — לא הורג
      // את השרת. הוא ממשיך לרוץ עוד 20 עד 80 שניות ואז כותב את התוצאה, בזמן
      // שהחלון כאן כבר פג והלקוחה קיבלה "היצירה נכשלה" על הרצה שהצליחה
      // (AP-0090). היא לחצה "נסו שוב", וזה, כמובן, "הסתדר".
      //
      // מכאן מחכים עד שיש **הכרעה**, ולא עד שנמאס לנו: `done`, `error`, או
      // `job_stalled` — שהשרת מכריז אחרי שש דקות על שורה שאיש לא נגע בה. זה
      // המחיר: על isolate שבאמת מת ההמתנה מתארכת מ-12 שניות לשש דקות. לכן
      // המסך אומר מה קורה במקום להסתובב בשקט (`DISCONNECTED_STAGE`), ולכן
      // הרשומה ב-`pendingJob` ממשיכה להחזיק את החוט גם אם היא סוגרת את הלשונית.
      onStage?.(DISCONNECTED_STAGE);
      return watched.then(
        (result) => ({ via: "job", result }) as Settled,
        (pollErr) => {
          // 404 — המזהה לא מוכר לשרת, כלומר הבקשה לא הגיעה מעולם. שם השגיאה
          // המקורית היא התשובה האמיתית. בכל מקרה אחר ההכרעה של השורה עדכנית
          // מהניתוק שקדם לה, והיא זו שמוצגת.
          if (pollErr instanceof ClientApiError && pollErr.status === 404) throw e;
          throw pollErr;
        },
      );
    },
  );

  const watching: Promise<Settled> = watched.then(
    (result) => ({ via: "job", result }) as Settled,
    (err) => {
      // 404 הוא הכשל היחיד של המשמר שאינו הכרעה: הוא אומר "אין שורה", והתשובה
      // למה אין אותה נמצאת אצל הבקשה — ושם היא מתורגמת לשגיאה המקורית. לכן
      // הזרוע הזו פשוט מפסיקה להתחרות במקום להכריע במקומה. כל השאר — `error`
      // על השורה, `job_stalled`, תפוגה — הם הכרעה של השרת, והיא גוברת גם על
      // בקשה שעדיין תלויה.
      if (err instanceof ClientApiError && err.status === 404) return new Promise<Settled>(() => {});
      throw err;
    },
  );

  let settled: Settled;
  try {
    settled = await Promise.race<Settled>([requested, watching]);
  } finally {
    // בין אם הכריעה הבקשה ובין אם הכריע המשמר — השני מפסיק לסקור. בלי זה
    // הרצה שהסתיימה בדקה השנייה הייתה משאירה סקר פתוח עוד שבע דקות.
    decided = true;
  }

  if (settled.via === "job") return settled.result;
  // השרת מריץ בתוך הבקשה ומחזיר את התוצאה. 202 עם מזהה הוא מסלול ישן/חלופי.
  const started = settled.body;
  if (!started.jobId) return started as GenerationResult;
  // במסלול הזה המזהה הוא של השרת. בפועל הוא שווה לשלנו (הוא מקבל אותו בגוף),
  // אבל אם ייבדל — מי שזוכר אותו צריך לדעת על מה באמת לשאול.
  if (started.jobId !== jobId) onJob?.(started.jobId);
  return pollJob(started.jobId, onStage);
}

/** מה שמבדיל משמר שרץ לצד הבקשה מסקר שרץ במקומה. */
interface PollGuards {
  /** השורה עוד לא נוצרה — 404 הוא "עוד לא", ולא "אינה קיימת". */
  unborn?: () => boolean;
  /** ההכרעה נפלה במקום אחר; הלולאה מפסיקה. */
  cancelled?: () => boolean;
}

/** מושכת את מצב ההרצה עד לתוצאה. */
async function pollJob(
  jobId: string,
  onStage?: (stage: string | null) => void,
  windowMs = POLL_TIMEOUT_MS,
  guards: PollGuards = {},
): Promise<GenerationResult> {
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    if (guards.cancelled?.()) throw new ClientApiError("cancelled", he.errGeneric, 0);
    let state: { status: string; stage?: string | null; result?: GenerationResult; error?: { code?: string } };
    try {
      state = await call(`/api/generate/${jobId}`);
    } catch (e) {
      // 404 אומר שהמזהה לא קיים — אין טעם להמשיך. כל השאר (רשת, 5xx חולף)
      // הוא כשל של המשיכה, לא של היצירה, והעבודה ממשיכה בשרת בלי קשר.
      //
      // חריג אחד: משמר שרץ לצד הבקשה שיוצרת את השורה. הסקר הראשון שלו יכול
      // להקדים את `startJob` — ואז 404 הוא תזמון, לא תשובה.
      if (e instanceof ClientApiError && e.status === 404 && !guards.unborn?.()) throw e;
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

  /** השלמת שם/טלפון/כתובת — אחרי הכניסה הראשונה, ואחרי כל הזמנה. הזהות כבר
   *  מאומתת ואין כאן הרשמה. (הכניסה עוברת ישירות מול Supabase Auth.) */
  updateAccount: (input: {
    name?: string; phone?: string; street?: string; city?: string; zip?: string;
  }) =>
    call<{ account: Account }>("/api/account", { method: "PATCH", body: JSON.stringify(input) }),

  signOut: () => call<{ ok: true }>("/api/account", { method: "DELETE" }),

  /**
   * בדיקת קוד הפניה (0026) — כדי שהמחיר ייראה לפני השליחה ולא יתגלה בה.
   *
   * התשובה כאן היא **תצוגה בלבד**: המחיר שנשמר מחושב שוב ב-`/api/orders`
   * מהקוד שהשרת שולף בעצמו. `ok: false` אינו שגיאת מסלול אלא תשובה — הקוד
   * נבדק ונדחה — ולכן היא חוזרת בגוף ולא כ-throw.
   */
  validateReferral: (input: { code: string; productType: "bracelet" | "ring" }) =>
    call<
      | { ok: true; code: string; label: string | null; pickup: boolean; price: Price }
      | { ok: false; reason: string }
    >("/api/referral-codes/validate", { method: "POST", body: JSON.stringify(input) }),

  designs: (profileId: string) =>
    call<{ designs: Design[] }>(`/api/designs?profileId=${encodeURIComponent(profileId)}`),

  /** העיצובים של החשבון המחובר — בלי פרמטר, הבעלות מהעוגייה. */
  myDesigns: () => call<{ designs: Design[] }>("/api/designs"),

  // בלי profileId: הבעלות נקבעת בשרת מהעוגייה של החשבון. הסטודיו הפנימי
  // עדיין שולח profileId של בודק — ראו את ההערה בסכימה של המסלול.
  createDesign: (input: {
    profileId?: string;
    productType: "bracelet" | "ring";
    name?: string;
    /** המסלול שהעיצוב נוצר בו (`"story"`). נשמר על הרשומה — ראה 0024. */
    mode?: string;
  }) =>
    call<{ design: Design }>("/api/designs", { method: "POST", body: JSON.stringify(input) }),

  getDesign: (id: string) =>
    call<{ design: Design; currentVersion: Version | null; versions: Version[] }>(`/api/designs/${id}`),

  /** הציור לכרטיס ב"העיצובים שלי" — כמה מאות בתים, בלי הגרסאות עצמן. */
  designPreview: (id: string) =>
    call<{
      preview: DesignPreview | null;
      /** כל התוצאות של העיצוב, החדשה ראשונה. חסר בשרת שעוד לא נפרס. */
      results?: Array<DesignPreview & { versionId: string; versionNo: number }>;
    }>(`/api/designs/${id}/preview`),

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
      /** ניסיון חוזר על הרצה שנקטעה — ראה `startAndAwaitGeneration`. */
      jobId?: string;
      /** story mode — המסלול הפשוט. ריק בכל מסלול אחר, וזו ההתנהגות הקיימת. */
      mode?: "story";
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

  /**
   * `fromVersionId` — הגרסה שהלקוחה צופה בה כשהיא בוחרת. השרת קובע לפיה גם את
   * ההרצה שההצעה שייכת לה וגם אם לעדכן את שורת הבחירה הקיימת במקום להוסיף
   * חדשה. בלעדיה הוא נופל ל-`current_version_id`, שאינו בהכרח מה שמוצג.
   */
  chooseCandidate: (
    designId: string,
    svg: string,
    index?: number,
    fromVersionId?: string,
    /** story mode — ההצעה נמסגרת למידות של עצמה. ריק = ההתנהגות הקיימת. */
    mode?: "story",
  ) =>
    call<{
      version: Version;
      report: ValidationReport;
      geometry: Geometry | null;
      lengthMm: number;
      widthMm: number;
    }>(`/api/designs/${designId}/choose`, {
      method: "POST",
      body: JSON.stringify({ svg, index, fromVersionId, mode }),
    }),

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

  /**
   * לינק שיתוף לגרסה. קריאה חוזרת על אותה גרסה מחזירה את אותו לינק.
   * `previewDataUrl` — צילום ההדמיה מהקנבס, שהופך לתמונת השיתוף.
   */
  createShare: (designId: string, versionId: string, previewDataUrl?: string | null) =>
    call<{ token: string; url: string; reused: boolean }>("/api/shares", {
      method: "POST",
      body: JSON.stringify({ designId, versionId, previewDataUrl: previewDataUrl ?? undefined }),
    }),

  /** "להזמין כזה": עותק של עיצוב ששותף, במידות של המזמין. */
  adoptShare: (token: string, dims: { lengthMm: number; widthMm: number; gapMm?: number }) =>
    call<{
      design: Design;
      version: Version;
      report: ValidationReport;
      geometry: Geometry | null;
      lengthMm: number;
      widthMm: number;
    }>(`/api/shares/${encodeURIComponent(token)}/adopt`, {
      method: "POST",
      body: JSON.stringify(dims),
    }),

  /**
   * משוב על תקלה חוזרת ביצירה — נשלח ממסך השגיאה, אחרי ש"נסו שוב" נכשל גם
   * הוא. `mailed` אומר אם מייל האישור באמת יצא: המסך מבטיח מייל רק כשיש אחד.
   */
  feedback: (input: {
    designId?: string;
    message?: string;
    errorMessage?: string;
    errorDetail?: string;
  }) =>
    call<{ ok: true; id: string; mailed: boolean }>("/api/feedback", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** הצילום הציבורי של שיתוף — מה שהמסע צריך כדי לפתוח במידות הנכונות. */
  share: (token: string) =>
    call<{
      token: string;
      productType: "bracelet" | "ring";
      lengthMm: number;
      widthMm: number;
      gapMm: number;
      serial: number | null;
    }>(`/api/shares/${encodeURIComponent(token)}`),
};
