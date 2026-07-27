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

/** שורה ברשימת היומן: הכול חוץ מה-SVG, שנטען רק בפתיחת הרצה. */
export type RunListRow = Omit<GenerationRunRow, "svg"> & { has_svg: boolean };

/** העמודות שהרשימה באמת מציגה. `svg` בכוונה בחוץ — הוא נשאל דרך has_svg
 *  (עמודה מחושבת, migration 0004): 80 שורות עם ה-SVG המלא היו 451KB ו-13.7
 *  שניות כדי לרנדר סימן וי. `select("*")` היה מחזיר אותו בכל פעם. */
const LIST_COLUMNS =
  "id, created_at, source, design_id, product_type, prompt, color_key, status, error, " +
  "duration_ms, render_model, render_path, stage_paths, metrics, debug, has_svg";

export async function listRuns(limit = 80): Promise<RunListRow[]> {
  const sb = supabaseAdmin();
  const query = (columns: string) =>
    sb.from("generation_runs").select(columns).order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await query(LIST_COLUMNS);
  if (!error) return (data ?? []) as unknown as RunListRow[];

  // migrate.yml ו-deploy.yml נדלקים מאותו push ורצים במקביל, כך שיש חלון שבו
  // ה-Worker כבר מבקש has_svg וה-DB עוד לא מכיר אותה. במקום להפיל את היומן על
  // תלות בסדר, נופלים חזרה למסלול הישן — איטי, אבל עובד — עד שההגירה נוחתת.
  if (!/has_svg/.test(error.message)) throw new Error(error.message);
  const legacy = await query(`${LIST_COLUMNS.replace(", has_svg", "")}, svg`);
  if (legacy.error) throw new Error(legacy.error.message);
  return ((legacy.data ?? []) as unknown as Array<Omit<RunListRow, "has_svg"> & { svg: string | null }>).map(
    ({ svg, ...rest }) => ({ ...rest, has_svg: svg !== null }),
  );
}

/** שורה בודדת מהיומן — לפירוט מלא (כולל ה-SVG של כל מועמד). */
export async function getRun(id: string): Promise<GenerationRunRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationRunRow | null) ?? null;
}
