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
}

/**
 * הרצה שנתקעה. ה-isolate שמריץ את העבודה יכול למות בלי לכתוב כלום — ואז
 * השורה נשארת 'running' לנצח והלקוחה מושכת בלי סוף. אחרי הגבול הזה מדווחים
 * כישלון: ארוך בנוחות מהרצה אמיתית (~30-90 שניות), קצר מספיק כדי לא להשאיר
 * מישהו מול ספינר.
 */
export const JOB_STALE_MS = 6 * 60_000;

/**
 * ה-jobId מגיע מהלקוחה. שני לקוחות שונים לעולם לא שולחים אותו מזהה — כל קריאה
 * מגרילה UUID טרי, וההתאוששות היא GET ולא POST חוזר. לכן התנגשות על מפתח קיים
 * אינה חידוש לגיטימי אלא ניסיון לדרוס job של מישהו אחר: הזורק הזה מבדיל אותה
 * משגיאה חולפת (טבלה חסרה בחלון מיגרציה), שאותה עדיין מותר לבלוע ולהמשיך.
 */
export class JobConflictError extends Error {}

export async function createJob(input: { id: string; designId: string; runId: string }): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("generation_jobs").insert({
    id: input.id,
    design_id: input.designId,
    run_id: input.runId,
    status: "running",
    stage: "rendering",
  });
  if (error) {
    if (error.code === "23505") throw new JobConflictError(`job ${input.id} already exists`);
    throw new Error(`create job failed: ${error.message}`);
  }
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
export const finishJob = (id: string, runId: string, result: unknown) =>
  patch(id, runId, { status: "done", stage: null, result });
export const failJob = (id: string, runId: string, error: JobError) =>
  patch(id, runId, { status: "error", stage: null, error });

/** בקשת יצירה כפי שהיומן צריך אותה — בלי `result`, שנושא את ה-SVG של כל מועמד. */
export type JobListRow = Omit<GenerationJobRow, "result">;

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

export async function getJob(id: string): Promise<GenerationJobRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationJobRow | null) ?? null;
}
