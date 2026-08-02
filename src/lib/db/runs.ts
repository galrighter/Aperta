import { supabaseAdmin } from "./supabase";
import type { ProductType } from "@/lib/fabrication.config";

// יומן הרצות הצינור (image→SVG). כל הרצה נשמרת — כולל דחיות ושגיאות — כדי
// שנוכל לאבחן תלונות ולכייל יחד. ראה migration 0003_generation_runs.sql.

export type RunSource = "studio" | "debug" | "upload";
export type RunStatus = "approved" | "rejected" | "error";

export interface RunStagePaths {
  /** תמונת הייחוס שנמסרה למודל בפועל — הכיתוב שנחתך מהפונט, או העיצוב שנערך.
   *  היא מרוסטרת בקופסה, ולכן זה המקום היחיד שבו הבייטים האלה קיימים. */
  reference?: string;
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
  /** כמה פסים בהדמיה אחת, באיזו רשת, וכמה קריאות למודל — התכנון של planRender.
   *  מספר החלופות הוא rows × cols. `cols` חסר בהרצות שנשמרו לפני שהיו עמודות. */
  rows?: number;
  cols?: number;
  calls?: number;
  /** צורת הקנבס שנשלחה למודל, `"1536x1024"`. שתי הרצות של אותו פריט על קנבסים
   *  שונים זהות בכל שדה אחר, ובלי זה אי אפשר להעמיד אותן זו מול זו ביומן. */
  canvasSize?: string;
  /**
   * כמה חלופות התכנון ביקש (`rows × cols`), וכמה פסים הקופסה באמת החזירה.
   *
   * הם לא תמיד שווים, וזה לא היה נראה בשום מקום. `split_columns` חותך פס
   * לעמודות **רק** כשהוא מוצא בדיוק `cols` קבוצות; אם המודל צייר שתי שורות
   * במקום רשת 2×2, כל פס נשאר שלם ומחצית מהחלופות שהוזמנו — ושולם עליהן
   * באותה קריאה — פשוט לא נוצרות. נמדד ב-RM-0068: תוכנן 4, חזרו 2.
   */
  plannedCandidates?: number;
  deliveredPanels?: number;
  minHoleMm?: number;
  colorKey?: string;
  /** כמה קבצים המשתמש צירף (השראה/סימון). */
  imageCount?: number;
  /**
   * הקובץ צורף ולא נשלח למודל, וזו הסיבה: `lettering` = הכיתוב תפס את מקום
   * תמונת הייחוס, `edit` = העיצוב הקיים תפס אותו. בלי השדה הזה שורה עם
   * `imageCount: 1` ובלי תמונת קלט נראית כמו כשל בהעלאה.
   */
  imageDropped?: "lettering" | "edit";
  /** עריכה: העיצוב הקיים נמסר למודל התמונה כרפרנס, וההרצה לא יצאה מאפס. */
  editedFromCurrent?: boolean;
  /**
   * מספר הגרסה שנמסרה למודל כתמונת בסיס. `editedFromCurrent` לבדו אומר
   * "יצאה ממשהו קיים" ולא ממה — והלקוחה יכולה לחזור לגרסה ישנה ולערוך אותה,
   * כך שהבסיס אינו בהכרח הגרסה האחרונה. בלי המספר אי אפשר להעמיד ביומן את
   * הפרומפט מול מה שהוא ראה.
   */
  editedFromVersion?: number;
  /** מסלול הבק־אופיס: התמונה היא הקלט עצמו ולא הדמיה שנוצרה. */
  imageUpload?: boolean;
  /** הפרומפט נכתב ידנית בבק־אופיס במקום להיבנות מהמידות. */
  promptOverride?: boolean;
  /**
   * הכיתוב שנחתך מהפונט ונמסר למודל כתמונת ייחוס, והטיפוגרפיה של כל שורה.
   * בלי זה אי אפשר להסביר ביומן למה חלופה אחת נראית אחרת מהשנייה — הפרומפט
   * זהה לכולן, וההבדל יושב בתמונה.
   */
  lettering?: {
    text?: string;
    rows: Array<{
      fontId: string;
      letterHeightMm: number;
      textWidthMm: number;
      /**
       * הגשרים שנחתכו בשורה הזו — **התכנון**, לא התיקון.
       *
       * `validation_report.bridges` של הגרסה מתעד רק את מה שנוסף *אחרי*
       * שהמודל צייר. הגשרים שנחתכו מהפונט לפני כן — אלה שהמודל מעתיק, ולכן
       * אלה שנראים ברוב העיצובים — לא נרשמו בשום מקום. תלונה על גשר שבולע
       * אות לא הייתה ניתנת לאבחון: לא היה מספר להעמיד מולה.
       */
      bridges?: Array<{
        /** האות שהחלל שייך לה. */
        char: string | null;
        /** רוחב הגשר שנחתך. */
        widthMm: number;
        /** המידה של החלל לאורך הציר שהגשר צר בו — היחס ביניהם הוא הפגיעה. */
        counterMm: number;
        /** אופקי (עברית) או אנכי (לטינית). */
        sideways: boolean;
      }>;
    }>;
  } | null;
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

/**
 * מאילו מהמזהים האלה קיימת שורת הרצה.
 *
 * צריך להישאל מול הטבלה ולא מול העמוד שנטען: תחת סינון ("נכשלו") העמוד מכיל
 * רק חלק מההרצות, וכל השאר נראות משם כאילו אינן קיימות. זה מה שגרם ליומן
 * להציג "כתיבת ההרצה נכשלה" על יצירות שהצליחו ונרשמו כשורה — ראה runs/orphans.
 */
export async function existingRunIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_runs").select("id").in("id", unique);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

/** "נכשלו" ביומן = כל מה שאינו `approved`: גם דחייה של הצינור וגם שגיאה. */
export type RunStatusFilter = "approved" | "problem";

export interface ListRunsOptions {
  limit?: number;
  /**
   * העמוד הבא: רק הרצות שקדמו לחותמת הזמן הזו. סמן ולא `offset` — היומן מקבל
   * שורות חדשות בראשו כל הזמן, ו-offset היה מדלג על שורה או מכפיל אותה בכל
   * פעם שהרצה נוספת נכתבה בין עמוד לעמוד.
   */
  before?: string | null;
  /** סינון בשרת, כדי ש"נכשלו" יסרוק את כל ההיסטוריה ולא רק את העמוד הראשון. */
  status?: RunStatusFilter | null;
}

export async function listRuns(opts: ListRunsOptions = {}): Promise<RunListRow[]> {
  const { limit = 20, before = null, status = null } = opts;
  const sb = supabaseAdmin();
  const query = (columns: string) => {
    let q = sb.from("generation_runs").select(columns);
    if (before) q = q.lt("created_at", before);
    if (status === "approved") q = q.eq("status", "approved");
    if (status === "problem") q = q.neq("status", "approved");
    return q.order("created_at", { ascending: false }).limit(limit);
  };

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
 * ספירה בלבד — `head: true` מחזיר את המספר בלי אף שורה.
 *
 * זה מה שמאפשר להציג "כמה נכשלו" גם כשהרשימה עצמה מעומדת: לספור דרך הרשימה
 * היה אומר לשלוף את כל ההרצות עם הפרומפטים והמדדים שלהן רק כדי למנות כמה מהן
 * אדומות — בדיוק הקריאה שהעימוד בא להפסיק.
 */
export async function countRuns(): Promise<{ total: number; failed: number }> {
  const sb = supabaseAdmin();
  const head = () => sb.from("generation_runs").select("id", { count: "exact", head: true });
  const [total, failed] = await Promise.all([head(), head().neq("status", "approved")]);
  if (total.error) throw new Error(total.error.message);
  if (failed.error) throw new Error(failed.error.message);
  return { total: total.count ?? 0, failed: failed.count ?? 0 };
}

/**
 * כמה הרצות נכשלו על תקציב שנגמר בטווח זמן נתון.
 *
 * זה מה שמונע הצפת מיילים: התקציב לא מתמלא מעצמו, ולכן כל לקוחה שמנסה ליצור
 * בינתיים תייצר כשל זהה. אם כבר יש כשל כזה בשעה שקדמה להרצה הנוכחית — ההתראה
 * כבר נשלחה, ואין מה לחזור עליה.
 *
 * החיפוש הוא על טקסט השגיאה כמו שנשמר ביומן: הוא נושא את גוף ה-429 של OpenAI
 * (`insufficient_quota` / `billing_hard_limit_reached`). עמודת קוד ייעודית
 * הייתה נקייה יותר, אבל היא מיגרציה שלמה בשביל שאילתה אחת שרצה רק בכשל.
 */
export async function countQuotaFailuresSince(sinceIso: string, beforeIso: string): Promise<number> {
  const sb = supabaseAdmin();
  const { count, error } = await sb
    .from("generation_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "error")
    .gte("created_at", sinceIso)
    .lt("created_at", beforeIso)
    .or("error.ilike.%quota%,error.ilike.%billing_hard_limit%");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * הבעלים **והמספר הסידורי** של כל עיצוב שביומן, בשאילתה אחת. הבעלים הוא מה
 * שמאפשר לקבץ את היומן לפי משתמש במקום לפי זמן.
 *
 * שאילתה נפרדת ולא embed: היומן חייב להיטען גם כשהעיצוב נמחק, גם כשמיגרציה
 * 0008 עוד לא רצה, וגם כשהעיצוב שייך לבודק בלי חשבון.
 *
 * ה-serial הוא הרפרנס האנושי (`RM-0047`) — אותו מספר שמופיע בלשונית העיצובים,
 * בהזמנה ובמייל ללקוחה. ביומן הוא נדרש בדיוק מאותה סיבה: תלונה מגיעה עם מספר,
 * ובלעדיו הדרך היחידה לקשור אותה להרצה היא uuid שאיש לא מקריא בטלפון.
 * best-effort — כשל כאן מחזיר מפות ריקות ומשאיר יומן בלי שיוך.
 */
export async function designsForRuns(
  designIds: string[],
): Promise<{ owners: Map<string, RunOwner>; serials: Map<string, number> }> {
  const ids = [...new Set(designIds)];
  const owners = new Map<string, RunOwner>();
  const serials = new Map<string, number>();
  if (ids.length === 0) return { owners, serials };
  try {
    const { data, error } = await supabaseAdmin()
      .from("designs")
      .select("id, serial, profiles(id, name, color, email)")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Array<{
      id: string;
      serial: number | null;
      profiles: RunOwner | null;
    }>) {
      if (row.profiles) owners.set(row.id, row.profiles);
      if (typeof row.serial === "number") serials.set(row.id, row.serial);
    }
  } catch (e) {
    console.error("run design lookup failed:", (e as Error).message);
  }
  return { owners, serials };
}

/** שורה בודדת מהיומן — לפירוט מלא (כולל ה-SVG של כל מועמד). */
export async function getRun(id: string): Promise<GenerationRunRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationRunRow | null) ?? null;
}
