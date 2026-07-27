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

export async function createJob(input: { id: string; designId: string; runId: string }): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("generation_jobs").insert({
    id: input.id,
    design_id: input.designId,
    run_id: input.runId,
    status: "running",
    stage: "rendering",
  });
  if (error) throw new Error(`create job failed: ${error.message}`);
}

async function patch(id: string, fields: Record<string, unknown>): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("generation_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  // כתיבת מצב היא best-effort: היא לא צריכה להפיל את העבודה עצמה.
  if (error) console.error(`update job ${id} failed:`, error.message);
}

export const setJobStage = (id: string, stage: JobStage) => patch(id, { stage });
export const finishJob = (id: string, result: unknown) => patch(id, { status: "done", stage: null, result });
export const failJob = (id: string, error: JobError) => patch(id, { status: "error", stage: null, error });

export async function getJob(id: string): Promise<GenerationJobRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationJobRow | null) ?? null;
}
