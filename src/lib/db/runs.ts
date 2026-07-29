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

/**
 * המאפיינים שקבעו את ההרצה — מה שצריך כדי לשחזר אותה או להסביר את התוצאה.
 * נשמר כ-jsonb ולא כעמודות: זו תצוגה לבק־אופיס, לא מפתח לשאילתה, והשדות
 * משתנים עם הצינור.
 */
export interface RunInputs {
  productType?: ProductType;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  /** כמה פסים בהדמיה אחת, וכמה קריאות למודל — התכנון של planRender. */
  rows?: number;
  calls?: number;
  minHoleMm?: number;
  colorKey?: string;
  /** כמה קבצים המשתמש צירף (השראה/סימון). */
  imageCount?: number;
  /** עריכה: העיצוב הקיים נמסר למודל התמונה כרפרנס, וההרצה לא יצאה מאפס. */
  editedFromCurrent?: boolean;
  /** מסלול הבק־אופיס: התמונה היא הקלט עצמו ולא הדמיה שנוצרה. */
  imageUpload?: boolean;
  /** הפרומפט נכתב ידנית בבק־אופיס במקום להיבנות מהמידות. */
  promptOverride?: boolean;
}

/** הבעלים של ההרצה — נגזר מהעיצוב, לקיבוץ היומן לפי משתמש. */
export interface RunOwner {
  id: string;
  name: string;
  color: string;
  email: string | null;
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
  /** קל: מה שהרשימה מציגה. ה-SVG של כל מועמד יושב ב-debug_full. */
  debug: unknown;
  /** ה-debug המלא כולל ה-SVG של כל מועמד — נקרא רק בפתיחת הרצה. */
  debug_full: unknown;
  /** הפרומפט המלא שנשלח למודל התמונה, כמו שהוא. נקרא רק בפתיחת הרצה. */
  render_prompt: string | null;
  inputs: RunInputs | null;
  /** קובץ ההשראה שהמשתמש צירף, ב-storage. */
  input_image_path: string | null;
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
  debug_full?: unknown;
  render_prompt?: string | null;
  inputs?: RunInputs | null;
  input_image_path?: string | null;
};

/** העמודות של 0009. מופרדות כדי שאפשר יהיה לכתוב שורה גם בלעדיהן. */
const INPUT_COLUMNS = ["render_prompt", "inputs", "input_image_path"] as const;

export async function insertRun(run: NewRun): Promise<void> {
  const sb = supabaseAdmin();
  const row = {
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
    debug_full: run.debug_full ?? null,
    render_prompt: run.render_prompt ?? null,
    inputs: run.inputs ?? null,
    input_image_path: run.input_image_path ?? null,
  };

  const { error } = await sb.from("generation_runs").insert(row);
  if (!error) return;

  // אותו חלון שבין migrate.yml ל-deploy.yml שהפיל את קריאת היומן יכול להפיל
  // כאן *כתיבה* — וזה גרוע יותר: הרצה שקרתה לא תיראה ביומן לעולם. עמודות 0009
  // הן תוספת אבחון; אם הן עוד לא קיימות, עדיף שורה בלעדיהן מאשר בלי שורה.
  if (!INPUT_COLUMNS.some((c) => error.message.includes(c))) {
    throw new Error(`insert run failed: ${error.message}`);
  }
  for (const c of INPUT_COLUMNS) delete (row as Record<string, unknown>)[c];
  const retry = await sb.from("generation_runs").insert(row);
  if (retry.error) throw new Error(`insert run failed: ${retry.error.message}`);
}

/** שורה ברשימת היומן: הכול חוץ מה-SVG, שנטען רק בפתיחת הרצה. */
export type RunListRow = Omit<GenerationRunRow, "svg" | "debug_full"> & { has_svg: boolean };

/** העמודות שהרשימה באמת מציגה. `svg` בכוונה בחוץ — הוא נשאל דרך has_svg
 *  (עמודה מחושבת, migration 0004): 80 שורות עם ה-SVG המלא היו 451KB ו-13.7
 *  שניות כדי לרנדר סימן וי. `select("*")` היה מחזיר אותו בכל פעם. */
const BASE_COLUMNS =
  "id, created_at, source, design_id, product_type, prompt, color_key, status, error, " +
  "duration_ms, render_model, render_path, stage_paths, metrics, debug";

/** `render_prompt` בכוונה בחוץ: הוא ארוך (כ-3KB להרצה) ואיש לא קורא אותו
 *  ברשימה. הוא נטען עם הפירוט, בפתיחת חלון הפרומפט. */
const LIST_COLUMNS = `${BASE_COLUMNS}, inputs, input_image_path, has_svg`;

export async function listRuns(limit = 80): Promise<RunListRow[]> {
  const sb = supabaseAdmin();
  const query = (columns: string) =>
    sb.from("generation_runs").select(columns).order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await query(LIST_COLUMNS);
  if (!error) return (data ?? []) as unknown as RunListRow[];

  // migrate.yml ו-deploy.yml נדלקים מאותו push ורצים במקביל, כך שיש חלון שבו
  // ה-Worker כבר מבקש עמודה וה-DB עוד לא מכיר אותה. במקום להפיל את היומן על
  // תלות בסדר, נופלים חזרה למסלול הישן — איטי, אבל עובד — עד שההגירה נוחתת.
  if (!/has_svg|inputs|input_image_path/.test(error.message)) throw new Error(error.message);
  const legacy = await query(`${BASE_COLUMNS}, svg`);
  if (legacy.error) throw new Error(legacy.error.message);
  return ((legacy.data ?? []) as unknown as Array<
    Omit<RunListRow, "has_svg" | "inputs" | "input_image_path"> & { svg: string | null }
  >).map(({ svg, ...rest }) => ({
    ...rest,
    has_svg: svg !== null,
    inputs: null,
    input_image_path: null,
  }));
}

/**
 * הבעלים של כל הרצה, לפי העיצוב שלה — מה שמאפשר לקבץ את היומן לפי משתמש
 * במקום לפי זמן. שאילתה נפרדת ולא embed: היומן חייב להיטען גם כשהעיצוב נמחק,
 * גם כשמיגרציה 0008 עוד לא רצה, וגם כשהעיצוב שייך לבודק בלי חשבון.
 * best-effort — כשל כאן מחזיר מפה ריקה ומשאיר יומן בלי שיוך.
 */
export async function ownersByDesign(designIds: string[]): Promise<Map<string, RunOwner>> {
  const ids = [...new Set(designIds)];
  const out = new Map<string, RunOwner>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabaseAdmin()
      .from("designs")
      .select("id, profiles(id, name, color, email)")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Array<{ id: string; profiles: RunOwner | null }>) {
      if (row.profiles) out.set(row.id, row.profiles);
    }
  } catch (e) {
    console.error("run owner lookup failed:", (e as Error).message);
  }
  return out;
}

/** שורה בודדת מהיומן — לפירוט מלא (כולל ה-SVG של כל מועמד). */
export async function getRun(id: string): Promise<GenerationRunRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationRunRow | null) ?? null;
}
