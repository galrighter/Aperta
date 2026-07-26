import { supabaseAdmin } from "./supabase";
import type { ProductType } from "@/lib/fabrication.config";

// יומן הרצות הצינור (image→SVG). כל הרצה נשמרת — כולל דחיות ושגיאות — כדי
// שנוכל לאבחן תלונות ולכייל יחד. ראה migration 0003_generation_runs.sql.

export type RunSource = "studio" | "debug" | "upload";
export type RunStatus = "approved" | "rejected" | "error";

export interface RunStagePaths {
  conditioned?: string;
  overlay?: string;
  difference?: string;
  rendered?: string;
}

export interface RunMetrics {
  iou?: number;
  holes?: number;
  meanDeviationMm?: number;
  maxDeviationMm?: number;
}

export interface GenerationRunRow {
  id: string;
  created_at: string;
  source: RunSource;
  design_id: string | null;
  product_type: ProductType | null;
  prompt: string | null;
  color_key: string | null;
  status: RunStatus;
  error: string | null;
  duration_ms: number | null;
  render_model: string | null;
  render_path: string | null;
  stage_paths: RunStagePaths;
  svg: string | null;
  metrics: RunMetrics | null;
  debug: unknown;
}

export type NewRun = {
  id: string;
  source: RunSource;
  design_id?: string | null;
  product_type?: ProductType | null;
  prompt?: string | null;
  color_key?: string | null;
  status: RunStatus;
  error?: string | null;
  duration_ms?: number | null;
  render_model?: string | null;
  render_path?: string | null;
  stage_paths?: RunStagePaths;
  svg?: string | null;
  metrics?: RunMetrics | null;
  debug?: unknown;
};

export async function insertRun(run: NewRun): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("generation_runs").insert({
    id: run.id,
    source: run.source,
    design_id: run.design_id ?? null,
    product_type: run.product_type ?? null,
    prompt: run.prompt ?? null,
    color_key: run.color_key ?? null,
    status: run.status,
    error: run.error ?? null,
    duration_ms: run.duration_ms ?? null,
    render_model: run.render_model ?? null,
    render_path: run.render_path ?? null,
    stage_paths: run.stage_paths ?? {},
    svg: run.svg ?? null,
    metrics: run.metrics ?? null,
    debug: run.debug ?? null,
  });
  if (error) throw new Error(`insert run failed: ${error.message}`);
}

export async function listRuns(limit = 80): Promise<GenerationRunRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("generation_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as GenerationRunRow[];
}

/** שורה בודדת מהיומן — לפירוט מלא (כולל ה-SVG של כל מועמד). */
export async function getRun(id: string): Promise<GenerationRunRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationRunRow | null) ?? null;
}
