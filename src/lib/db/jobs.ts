import { supabaseAdmin } from "./supabase";

// בקשות יצירה שרצות ברקע. ראה migration 0005_generation_jobs.sql.
//
// הטבלה קיימת כדי שתוצאה של הרצה שהצליחה לא תלויה בכך שהחיבור של הלקוחה שרד
// את כל הדקה וחצי. השרת כותב לכאן; הלקוחה מושכת מכאן.

export type JobStatus = "running" | "done" | "error";
export type JobStage = "rendering" | "saving";

export interface JobError {
  code: string;
  message: string;
}

export interface GenerationJobRow {
  id: string;
  created_at: string;
  updated_at: string;
  design_id: string | null;
  run_id: string | null;
  status: JobStatus;
  stage: JobStage | null;
  result: unknown;
  error: JobError | null;
  /**
   * מה שנדרש כדי לסיים את ההרצה **בלי** הבקשה שפתחה אותה (`runs/complete.ts`,
   * מיגרציה 0019). `null` = הרצה שנפתחה לפני המיגרציה, או שנפלה לפני שההקשר
   * היה ידוע; שתיהן מתנהגות כמו קודם.
   *
   * `unknown` ולא הטיפוס עצמו, כמו `result`: הטבלה היא רישום, והפירוש שייך
   * למי שקורא אותו.
   */
  context: unknown;
}

/**
 * הרצה שנתקעה. ה-isolate שמריץ את העבודה יכול למות בלי לכתוב כלום — ואז
 * השורה נשארת 'running' לנצח והלקוחה מושכת בלי סוף. אחרי הגבול הזה מדווחים
 * כישלון: ארוך בנוחות מהרצה אמיתית (~30-90 שניות), קצר מספיק כדי לא להשאיר
 * מישהו מול ספינר.
 */
export const JOB_STALE_MS = 6 * 60_000;

/**
 * ה-jobId מגיע מהלקוחה, ולכן התנגשות על מפתח קיים היא או חידוש לגיטימי או
 * ניסיון לדרוס job של מישהו אחר. הזורק הזה מסמן את המקרה השני, ומבדיל אותו
 * משגיאה חולפת (טבלה חסרה בחלון מיגרציה) שאותה עדיין מותר לבלוע ולהמשיך.
 *
 * השורה שנמצאה נוסעת עם החריגה. לא כדי לחסוך שאילתה אלא כי בלעדיה הקורא יודע
 * רק ש"היה משהו" — והוא צריך לדעת **מה**: job שהסתיים על אותו עיצוב מחזיק את
 * התשובה שהלקוחה חיכתה לה, ו-409 עליו הוא בדיוק הכשל שתועד ב-AP-0090. `null`
 * = השורה נעלמה בין ה-insert לקריאה, ואז אין מה להציע מלבד ההתנגשות עצמה.
 */
export class JobConflictError extends Error {
  constructor(message: string, readonly job: GenerationJobRow | null = null) {
    super(message);
  }
}

/**
 * פותח את ה-job, או **מחדש** אחד שעדיין רץ.
 *
 * חידוש הוא הצד השני של C2 (docs/C2_RESILIENT_GENERATION.md): הקופסה מחזיקה את
 * ההרצה תחת מזהה שנגזר מ-`jobId`, ולכן בקשה חוזרת עם אותו מזהה אוספת עבודה
 * ששולמה כבר. אם השורה כאן הייתה חוסמת אותה ב-409, הנתיב הזה לא היה קיים.
 *
 * הגבול מדויק: מחדשים רק job שהוא `running` ושייך **לאותו עיצוב** שהפונה כבר
 * עבר עליו `requireDesignAccess`. תוקף לא מגיע לשם — הוא נחסם על העיצוב. job
 * שהסתיים נשאר 409: התוצאה כבר שם, ויש לקרוא אותה ולא להריץ מחדש.
 */
export async function startJob(
  input: { id: string; designId: string; runId: string },
): Promise<"created" | "resumed"> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("generation_jobs").insert({
    id: input.id,
    design_id: input.designId,
    run_id: input.runId,
    status: "running",
    stage: "rendering",
  });
  if (!error) return "created";
  if (error.code !== "23505") throw new Error(`create job failed: ${error.message}`);

  const existing = await getJob(input.id);
  if (!existing || existing.design_id !== input.designId || existing.status !== "running") {
    throw new JobConflictError(`job ${input.id} already exists`, existing);
  }
  // `updated_at` נדחף קדימה כדי שהשעון של "תקוע" (JOB_STALE_MS) יימדד מהחידוש
  // ולא מהניסיון שנקטע — אחרת הלקוחה תראה "נכשל" בזמן שההרצה בדיוק חזרה לחיים.
  //
  // ו-`run_id` נכתב מחדש: שורה שנפתחה בגרסה שבה המזהה עוד הוגרל נושאת מזהה
  // אחר מזה שהחידוש גזר, וכל כתיבת מצב אחריו (שמוצמדת ל-run_id) הייתה נופלת
  // בשקט — הלקוחה הייתה רואה job שנשאר 'running' עד שייחשב תקוע.
  await patch(input.id, existing.run_id ?? input.runId, {
    stage: "rendering",
    run_id: input.runId,
  });
  return "resumed";
}

async function patch(id: string, runId: string, fields: Record<string, unknown>): Promise<void> {
  const sb = supabaseAdmin();
  // ההצמדה ל-run_id היא הגנה שנייה: גם אם התנגשות ה-insert נבלעה איפשהו, כתיבת
  // מצב לא תיגע בשורה שנוצרה בהרצה אחרת — רק ההרצה שבבעלותה מעדכנת אותה.
  const { error } = await sb
    .from("generation_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("run_id", runId);
  // כתיבת מצב היא best-effort: היא לא צריכה להפיל את העבודה עצמה.
  if (error) console.error(`update job ${id} failed:`, error.message);
}

export const setJobStage = (id: string, runId: string, stage: JobStage) => patch(id, runId, { stage });

/**
 * ההקשר שיאפשר לסיים את ההרצה בלי הבקשה שפתחה אותה.
 *
 * נכתב **בזמן** שהרנדר רץ ולא אחריו — זו כל הנקודה: הבקשה יכולה למות באמצע
 * הדקה וחצי, ומי שיגיע לשורה אחר כך צריך למצוא שם את מה שדרוש כדי להרים את
 * החוט. כמו כל כתיבת מצב כאן, כישלון אינו מפיל את ההרצה.
 */
export const setJobContext = (id: string, runId: string, context: unknown) =>
  patch(id, runId, { context });
export const finishJob = (id: string, runId: string, result: unknown) =>
  patch(id, runId, { status: "done", stage: null, result });

/**
 * סגירת job במסלול ההתאוששות — עם תשובה על מי סגר אותו.
 *
 * ההבדל מ-`finishJob` הוא התניה על `status = 'running'`, והיא קיימת בגלל
 * הלקוחה: היא מושכת כל שנייה וחצי, ולכן שני סקרים יכולים למצוא את אותה גרסה
 * משוחזרת בו-זמנית. `finishJob` היה נותן לשניהם לכתוב `done` בלי הבדל ביניהם,
 * וכל אחד היה שולח את מייל "העיצוב מוכן" — שני מיילים על אותו עיצוב.
 *
 * כאן רק העדכון שהעביר את השורה מ-`running` נוגע בשורה, ולכן `true` חוזר
 * לסקר אחד בלבד. הוא הבעלים של ההתאוששות הזו, וההתראה נתלית בו.
 *
 * שגיאה מחזירה `false`: כתיבת מצב היא best-effort (אין להפיל את התשובה
 * ללקוחה בגללה), אבל היא **לא** רשות לשלוח מייל על סמך סגירה שלא ידוע שקרתה.
 */
export async function claimJobDone(id: string, runId: string, result: unknown): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("generation_jobs")
    .update({ status: "done", stage: null, result, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("run_id", runId)
    .eq("status", "running")
    .select("id");
  if (error) {
    console.error(`claim job ${id} failed:`, error.message);
    return false;
  }
  return (data ?? []).length > 0;
}
/**
 * בעלות על **ההשלמה עצמה** — נתפסת לפני שהיא מתחילה, לא אחריה.
 *
 * **מה זה מתקן (13.8).** `completeFromContext` מתועדת כ"בטוחה להריץ פעמיים",
 * בתנאי שהקורא יוודא קודם שאין כבר גרסה להרצה. התנאי הזה הוא בדיקה-ואז-פעולה,
 * וברירת המחדל היא להפסיד אותו: ההשלמה עצמה נמשכת שתיים-שלוש שניות (איסוף
 * מהקופסה, מסגור, ולידציה, שמירה), והלקוחה מושכת כל שנייה וחצי — ו-
 * `DesignReadyWatch` כל שש. כל מי שנכנס בחלון הזה מוצא "אין גרסה", כי הראשון
 * עוד לא כתב אותה, ורץ ingest משלו.
 *
 * נמדד על job 5c555ac8 (13.8, 18:20:10–18:20:14): **שבע** גרסאות זהות בייט-
 * בייט (אותו md5, אותו `generation_id`), בהפרש 400 מ"ש זו מזו. `claimJobDone`
 * מנע רק את המייל הכפול — הוא רץ בסוף, אחרי שכל שבע כבר נכתבו.
 *
 * כאן העדכון המותנה קודם לעבודה: מי שהצליח להזיז את `updated_at` מהערך שראה
 * הוא הבעלים, וכל השאר חוזרים "עדיין רצה" ומושכים שוב. הדחיפה של `updated_at`
 * היא גם התשובה הנכונה לסקר הבא — השלמה בתהליך אינה שורה נטושה.
 *
 * `false` = מישהו אחר הקדים (או שהשורה כבר לא `running`). לא שגיאה.
 */
export async function claimRecovery(id: string, runId: string, seenAt: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("generation_jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("run_id", runId)
    .eq("status", "running")
    // הנעילה עצמה: הערך שהקורא ראה. שני קוראים שקראו את אותה שורה — רק אחד
    // מהם מוצא אותה עדיין בערך הזה כשהוא כותב.
    .eq("updated_at", seenAt)
    .select("id");
  if (error) {
    console.error(`claim recovery ${id} failed:`, error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

export const failJob = (id: string, runId: string, error: JobError) =>
  patch(id, runId, { status: "error", stage: null, error });

/** בקשת יצירה כפי שהיומן צריך אותה — בלי `result` (שנושא את ה-SVG של כל מועמד)
 *  ובלי `context` (שנושא את התיאור והגשרים). היומן מציג שורות, לא מטענים. */
export type JobListRow = Omit<GenerationJobRow, "result" | "context">;

/**
 * בקשות היצירה האחרונות. היומן מצליב אותן מול ההרצות כדי למצוא ניסיון שלא
 * הגיע לשורת הרצה — בקשה שנקטעה באמצע משאירה רק את השורה הזאת, ובלעדיה היא
 * נעלמת: ביומן היא נראית בדיוק כמו יצירה שלא קרתה מעולם.
 */
export async function listRecentJobs(limit = 80): Promise<JobListRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("generation_jobs")
    .select("id, created_at, updated_at, design_id, run_id, status, stage, error")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as JobListRow[];
}

/**
 * ההרצות שנתקעו: `running` שאיש לא נגע בהן מעבר לסף, ושיש להן הקשר לסיים ממנו.
 *
 * מיון מהוותיקה לחדשה — מי שממתינה הכי הרבה זמן נענית ראשונה, וסריקה שנחתכת
 * בתקרה לא מרעיבה אף אחת: הבאה בתור תיאסף בסבב הבא.
 *
 * שורה בלי `context` אינה נשלפת כלל. אין מה לעשות איתה, והיא רק הייתה תופסת
 * מקום בתקרה על חשבון שורה שכן ניתן לסיים.
 */
export async function listStalledJobs(limit = 20): Promise<GenerationJobRow[]> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - JOB_STALE_MS).toISOString();
  const { data, error } = await sb
    .from("generation_jobs")
    .select("*")
    .eq("status", "running")
    .lt("updated_at", cutoff)
    .not("context", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as GenerationJobRow[];
}

/** הכשל שנרשם על בקשת היצירה של הרצה, כפי שהיומן צריך להציג אותו. */
export interface RunJobFailure extends JobError {
  /** מצב הבקשה עצמה — כדי להבדיל בין "נכשלה" לבין "עדיין רצה". */
  status: JobStatus;
}

/**
 * הכשל של בקשת היצירה מאחורי כל הרצה בעמוד, בשאילתה אחת.
 *
 * **למה זה נדרש.** שורת ההרצה נכתבת באמצע הצינור, עם הפסיקה של הווקטורייזר —
 * ומה שנכשל *אחריה* (מסגור, ולידציה, שמירת הגרסה) נרשם על שורת ה-job בלבד.
 * שלוש דרכים מגיעות לשם ואף אחת מהן לא נוגעת בהרצה: `failJob` במסלול המשיכה,
 * בסריקה, ו-`markRunError` שדילג במכוון על `ApiError`/`LlmError`. התוצאה
 * נמדדה על AP-0096 — שלוש הרצות עם סטטוס "approved" ובלי שגיאה, שאף אחת מהן
 * לא הולידה גרסה, והלקוחה לא קיבלה כלום. הכשל האמיתי
 * (`rescaleCutoutsSvg: unsupported path command "C"`) ישב על ה-job והיומן
 * מעולם לא הראה אותו.
 *
 * `run_id` של ה-job הוא **מזהה ההרצה הראשונה** של אותה בקשה, ולכן ניסיון שני
 * (`attempt: 2`) לא נושא את הכשל בעצמו — הוא מוצג על השורה שהבקשה הצביעה
 * עליה. best-effort, כמו `versionsForRuns`: כשל כאן משאיר יומן בלי השורה
 * הנוספת, ולא יומן בלי שורות.
 */
export async function jobFailuresForRuns(runIds: string[]): Promise<Map<string, RunJobFailure>> {
  const ids = [...new Set(runIds.filter(Boolean))];
  const out = new Map<string, RunJobFailure>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabaseAdmin()
      .from("generation_jobs")
      .select("run_id, status, error")
      .in("run_id", ids)
      .not("error", "is", null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{
      run_id: string | null;
      status: JobStatus;
      error: JobError | null;
    }>) {
      if (!row.run_id || !row.error?.message || out.has(row.run_id)) continue;
      out.set(row.run_id, {
        code: row.error.code,
        message: row.error.message,
        status: row.status,
      });
    }
  } catch (e) {
    console.error("run job failure lookup failed:", (e as Error).message);
  }
  return out;
}

export async function getJob(id: string): Promise<GenerationJobRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationJobRow | null) ?? null;
}
