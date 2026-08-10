import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import type { ProductType } from "@/lib/fabrication.config";
import type { BridgeRecord } from "@/lib/geometry/restoreBridges";

export interface DesignRow {
  id: string;
  profile_id: string;
  /** המספר הסידורי (0008) — הרפרנס האנושי (`AP-0047`). null בעיצוב שנוצר
   *  לפני המיגרציה, ו-undefined במסד שעוד לא קיבל אותה. */
  serial: number | null;
  /** 0018 — כשהעיצוב הוא דוגמה (שכפול), שלושתם מלאים ומצביעים על עיצוב-האב:
   *  `root_design_id` למעקב, `root_serial`+`sample_no` לתצוגה (designSampleCode). */
  root_design_id: string | null;
  root_serial: number | null;
  sample_no: number | null;
  name: string;
  product_type: ProductType;
  length_mm: number;
  width_mm: number;
  gap_mm: number;
  thickness_mm: number;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/** הצעה שהוצעה יחד עם גרסה. בדיוק מה ש-/api/generate מחזיר. */
export interface VersionCandidate {
  svg: string;
  report: unknown;
  drawnRatio?: number;
  stretch?: number;
  /** מה שהמסגור עשה לכל אי מתכת אצל **המועמד הזה**. נשמר לכל אחד ולא רק לזוכה:
   *  הגישור הוא החלטה שמשנה את הצורה, וגרסה שמראה אותה רק למי שנבחר לא נותנת
   *  לענות על "למה האות הזו נראית ככה" באף אחת מהחלופות. */
  bridges?: BridgeRecord[];
}

export interface VersionRow {
  id: string;
  design_id: string;
  version_no: number;
  svg: string;
  source: "generate" | "edit" | "auto_repair";
  user_prompt: string | null;
  annotation_png_path: string | null;
  validation_report: unknown;
  validation_status: "pass" | "warn" | "fail";
  created_at: string;
  /** 0012 — undefined במסד שעוד לא קיבל את המיגרציה, כמו `serial` ב-0008. */
  candidates?: VersionCandidate[] | null;
  generation_id?: string | null;
  picked_index?: number | null;
}

export async function getDesign(id: string): Promise<DesignRow> {
  const { data, error } = await supabaseAdmin()
    .from("designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ApiError("not_found", "Design not found", 404);
  return data as DesignRow;
}

/** מספר הדוגמה הבא תחת עיצוב-אב, עם הגנה מפני מירוץ מול `idx_designs_root_sample`. */
async function nextSampleNo(rootId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("designs")
    .select("sample_no")
    .eq("root_design_id", rootId)
    .order("sample_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.sample_no as number | undefined) ?? 0) + 1;
}

/**
 * עיצוב-דוגמה חדש תחת עיצוב-אב: אותו פרופיל, אותן מידות, ומספר מהצורה
 * `AP-0085.2` — מספר משלו, עם האינדיקציה לעיצוב שממנו הוא נגזר.
 *
 * `root_design_id` מצביע תמיד על אב-הקדמון (לא על ההורה המיידי) כדי שהמיספור
 * יישאר שטוח — דוגמה של דוגמה היא אחות, לא נכדה.
 *
 * שני קוראים: שכפול מפורש ("צור עותק"), ו**בקשת שינוי** — מאז 10.8 (החלטת גל)
 * כל תמונה שהמודל מייצר מקבלת מספר עיצוב משלה, כדי ש"עיצוב AP-0085" יצביע
 * לעולם על צורה אחת ולא על מה שבמקרה מוצג. העריכה יוצרת דוגמה ולא עיצוב עצמאי:
 * המספר עצמו הוא הקישור למקור.
 */
export async function createSampleDesign(base: DesignRow, name?: string): Promise<DesignRow> {
  const rootId = base.root_design_id ?? base.id;
  const rootSerial = base.root_serial ?? base.serial;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sampleNo = await nextSampleNo(rootId);
    const { data, error } = await supabaseAdmin()
      .from("designs")
      .insert({
        profile_id: base.profile_id,
        name: name ?? base.name,
        product_type: base.product_type,
        length_mm: base.length_mm,
        width_mm: base.width_mm,
        gap_mm: base.gap_mm,
        thickness_mm: base.thickness_mm,
        root_design_id: rootId,
        root_serial: rootSerial,
        sample_no: sampleNo,
      })
      .select("*")
      .single();
    if (data) return data as DesignRow;
    // מירוץ בין שתי דוגמאות מקבילות מאותו אב — ניסיון נוסף עם מספר עדכני.
    if (!/duplicate|unique/i.test(error?.message ?? "")) throw new Error(error?.message);
  }
  throw new Error("Failed to allocate a sample number");
}

/**
 * הגישור של ההרצה: של הגרסה שנשמרה, ושל כל הצעה שהוצעה לצידה.
 *
 * נקרא מהגרסה ולא מההרצה כי שם זה נכתב — הגישור הוא תכונה של הגאומטריה
 * שנשמרה, **ושתי הצעות מאותה הרצה מגושרות אחרת.** בדיוק בגלל זה מוחזרות גם
 * ההצעות: הזוכה לבדו ענה על "מה תוקן" רק ברבע מהמקרים, ושלוש החלופות נראו
 * ביומן כאילו לא נגעו בהן. `null` = הרצה בלי גרסה, או גרסה מלפני השדה.
 */
export async function bridgesForRun(
  generationId: string,
): Promise<{
  bridges: unknown[] | null;
  candidates: VersionCandidate[] | null;
  /**
   * הגאומטריה **שנשמרה** — זו שהלקוחה מקבלת ושתיחתך.
   *
   * `generation_runs.svg` הוא הפלט הגולמי של הווקטורייזר, לפני המסגור: לפני
   * המתיחה למידה שהוזמנה, לפני הגישור ולפני העיבוי. הבק־אופיס הציג אותו
   * בכותרת "SVG סופי", ולכן כל גשר שאנחנו מוסיפים היה בלתי נראה שם — נמדד
   * ב-AP-0075, שבו הלקוחה ראתה פס על ה-G והיומן הראה אות נקייה. גם השכבה
   * שמציירת את הגשרים מעל העיצוב נשענה עליו, כלומר צוירה על קואורדינטות
   * ממסגרת אחרת.
   */
  svg: string | null;
  versionNo: number | null;
  /**
   * מזהה הגרסה שההרצה הזו שמרה — מה שצריך כדי לבנות ממנה קבצי ייצור.
   *
   * הגרסה **של ההרצה**, ולא `current_version_id` של העיצוב: ביומן שואלים
   * "מה יצא מההרצה הזו", ואחרי עוד סבב עריכה הנוכחית היא כבר הרצה אחרת.
   */
  versionId: string | null;
}> {
  const { data, error } = await supabaseAdmin()
    .from("design_versions")
    .select("id, validation_report, candidates, svg, version_no")
    .eq("generation_id", generationId)
    .order("version_no", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return { bridges: null, candidates: null, svg: null, versionNo: null, versionId: null };
  }
  const row = data as {
    id?: string | null;
    validation_report?: { bridges?: unknown[] };
    candidates?: VersionCandidate[] | null;
    svg?: string | null;
    version_no?: number | null;
  };
  return {
    bridges: row.validation_report?.bridges ?? null,
    candidates: row.candidates ?? null,
    svg: row.svg ?? null,
    versionNo: row.version_no ?? null,
    versionId: row.id ?? null,
  };
}

export async function getVersion(id: string): Promise<VersionRow> {
  const { data, error } = await supabaseAdmin()
    .from("design_versions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ApiError("not_found", "Version not found", 404);
  return data as VersionRow;
}

/**
 * הגרסה שהרצה מסוימת הפיקה, אם הפיקה.
 *
 * זו העדות שהעבודה הסתיימה גם כששורת ה-job לא מספרת את זה. הגרסה נכתבת בסוף
 * `ingestCutouts`, ומיד אחריה נסגר ה-job — ובחלון שביניהם ה-isolate יכול להיהרג
 * (`exceededResources`, ראו docs/worker-memory-diagnosis.md). אז השורה נשארת
 * 'running' לנצח בזמן שהעיצוב כבר שמור, והלקוחה מקבלת "היצירה נכשלה" על עיצוב
 * שקיים. הקיום של גרסה להרצה הזו הוא מה שמאפשר להתאושש מזה בקריאה.
 */
export async function versionForGeneration(generationId: string): Promise<VersionRow | null> {
  // לפי מזהה ההרצה בלבד, בלי סינון לפי עיצוב: מאז שעריכה נשמרת כדוגמה
  // ממוספרת (10.8), הגרסה של הרצת-עריכה יושבת על עיצוב **אחר** מזה ששורת
  // ה-job מצביעה עליו. מזהה ההרצה ממילא ייחודי גלובלית — הוא נגזרת uuid.
  const { data, error } = await supabaseAdmin()
    .from("design_versions")
    .select("*")
    .eq("generation_id", generationId)
    // הגבוהה ביותר: ניסיון חוזר שנפל באותה נקודה מוסיף עוד גרסה לאותה הרצה,
    // ומה שמעניין את הלקוחה הוא האחרונה.
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  // עמודת `generation_id` היא של 0012. מסד שעוד לא קיבל אותה יחזיר שגיאה, וזו
  // התאוששות ולא מסלול חובה — עדיף לוותר עליה מאשר להפיל את הסקר.
  if (error) return null;
  return (data as VersionRow | null) ?? null;
}

/**
 * נתיב ההדמיה של גרסה, מתוך `validation_report` (jsonb).
 *
 * הוא יושב שם ולא בעמודה — ראו ההערה ב-`ingestCutouts`. נקרא בהגנה: הדוח מגיע
 * מכל גרסה שאי פעם נשמרה, כולל כאלה שנכתבו לפני שהשדה הזה נוסף, ולפני שהיה
 * לו טיפוס.
 */
export function renderPathOf(version: Pick<VersionRow, "validation_report">): string | null {
  const report = version.validation_report as { renderPngPath?: unknown } | null;
  const path = report?.renderPngPath;
  return typeof path === "string" && path.length > 0 ? path : null;
}

export async function listVersions(designId: string): Promise<VersionRow[]> {
  // `*` ולא רשימה מפורשת: העמודות של 0012 חסרות במסד שעוד לא קיבל את המיגרציה,
  // ורשימה מפורשת הייתה מפילה את הקריאה כולה במקום להחזיר אותן כ-undefined.
  // הרשימה המפורשת ממילא כללה את `svg` ו-`validation_report`, כלומר את כל מה
  // שכבד בשורה — אין כאן ויתור על חיסכון.
  const { data, error } = await supabaseAdmin()
    .from("design_versions")
    .select("*")
    .eq("design_id", designId)
    .order("version_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VersionRow[];
}

/** שמירת גרסה חדשה ועדכון current_version_id — version_no רץ לפי המקסימום הקיים. */
export async function insertVersion(v: {
  design_id: string;
  svg: string;
  source: VersionRow["source"];
  user_prompt: string | null;
  annotation_png_path: string | null;
  validation_report: unknown;
  validation_status: VersionRow["validation_status"];
  /** 0012 — נשלחות רק כשהוגדרו, ונופלות בשקט אם המיגרציה עוד לא רצה (ראו להלן). */
  candidates?: VersionCandidate[] | null;
  generation_id?: string | null;
  picked_index?: number | null;
}): Promise<VersionRow> {
  const sb = supabaseAdmin();
  // שדות 0012 נשלחים רק אם יש להם ערך: מסד שעוד לא קיבל את המיגרציה דוחה
  // עמודה לא מוכרת, וכשלון כאן הוא כשלון של *היצירה כולה* — לא של שמירת נספח.
  const { candidates, generation_id, picked_index, ...core } = v;
  const extras: Record<string, unknown> = {};
  if (candidates !== undefined) extras.candidates = candidates;
  if (generation_id !== undefined) extras.generation_id = generation_id;
  if (picked_index !== undefined) extras.picked_index = picked_index;
  let withExtras = Object.keys(extras).length > 0;

  // ניסיון חוזר במקרה של התנגשות על unique(design_id, version_no)
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: maxRow, error: maxErr } = await sb
      .from("design_versions")
      .select("version_no")
      .eq("design_id", v.design_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw new Error(maxErr.message);
    const nextNo = (maxRow?.version_no ?? 0) + 1;
    const { data, error } = await sb
      .from("design_versions")
      .insert({ ...core, ...(withExtras ? extras : {}), version_no: nextNo })
      .select("*")
      .single();
    if (!error && data) {
      const { error: updErr } = await sb
        .from("designs")
        .update({ current_version_id: data.id, updated_at: new Date().toISOString() })
        .eq("id", v.design_id);
      if (updErr) throw new Error(updErr.message);
      return data as VersionRow;
    }
    // מסד בלי 0012: הגרסה עצמה חשובה יותר מההצעות שנלוות לה. מוותרים על הנספח
    // וממשיכים, במקום להפיל יצירה שהצליחה בגלל שלוש עמודות שאינן קיימות עדיין.
    if (withExtras && /column .* does not exist|schema cache/i.test(error?.message ?? "")) {
      withExtras = false;
      continue;
    }
    if (!/duplicate|unique/i.test(error?.message ?? "")) {
      throw new Error(error?.message ?? "insert version failed");
    }
  }
  throw new Error("Failed to allocate version number");
}

/**
 * דריסת גרסה קיימת בתוכן חדש, במקום להוסיף שורה.
 *
 * קיים בשביל מקרה אחד: מעבר בין ההצעות של אותה הרצה. זה **ניווט ולא שינוי** —
 * הלקוחה משווה בין אפשרויות שכבר נוצרו, ולא מבקשת מהמנוע דבר. עד כה כל לחיצה
 * הוסיפה גרסה, ו-AP-0061 (נמדד) הגיע לשש שורות ביומן על יצירה אחת עם שלוש
 * הצעות — שלוש מהן אותה גיאומטריה בדיוק, כי חזרה להצעה שכבר נבחרה נספרה
 * כאירוע חדש. כאן הבחירה מקבלת שורה אחת לכל הרצה, שמתעדכנת.
 *
 * `version_no` ו-`generation_id` נשמרים: זו אותה שורה, לא חדשה.
 */
export async function replaceVersion(
  id: string,
  v: {
    svg: string;
    validation_report: unknown;
    validation_status: VersionRow["validation_status"];
    picked_index?: number | null;
  },
): Promise<VersionRow> {
  const sb = supabaseAdmin();
  const { picked_index, ...core } = v;
  // כמו ב-insertVersion: מסד בלי 0012 דוחה את העמודה, והתוכן חשוב מהסימון.
  for (const withPick of picked_index !== undefined ? [true, false] : [false]) {
    const { data, error } = await sb
      .from("design_versions")
      .update({ ...core, ...(withPick ? { picked_index } : {}) })
      .eq("id", id)
      .select("*")
      .single();
    if (!error && data) {
      const { error: updErr } = await sb
        .from("designs")
        .update({ current_version_id: data.id, updated_at: new Date().toISOString() })
        .eq("id", (data as VersionRow).design_id);
      if (updErr) throw new Error(updErr.message);
      return data as VersionRow;
    }
    if (withPick && /column .* does not exist|schema cache/i.test(error?.message ?? "")) continue;
    throw new Error(error?.message ?? "update version failed");
  }
  throw new Error("update version failed");
}

/** מכסת בקשות יומית: מספר הגרסאות שנוצרו היום לכל עיצובי הפרופיל. */
export interface RecentVersionRow extends VersionRow {
  design_name: string;
  design_width_mm: number;
}

/** גרסאות אחרונות מכל העיצובים (לבק־אופיס) — עם שם העיצוב ומידותיו. */
export async function listRecentVersions(limit = 60): Promise<RecentVersionRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("design_versions")
    .select(
      "id, design_id, version_no, source, user_prompt, validation_status, created_at, svg, validation_report, annotation_png_path, designs(name, width_mm)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<
    VersionRow & { designs: { name: string; width_mm: number } | null }
  >;
  return rows.map((r) => ({
    ...r,
    design_name: r.designs?.name ?? "—",
    design_width_mm: Number(r.designs?.width_mm ?? 0),
  }));
}

export async function countTodayGenerations(profileId: string): Promise<number> {
  const sb = supabaseAdmin();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data: designs, error } = await sb
    .from("designs")
    .select("id")
    .eq("profile_id", profileId);
  if (error) throw new Error(error.message);
  const ids = (designs ?? []).map((d) => d.id);
  if (ids.length === 0) return 0;
  const { count, error: cntErr } = await sb
    .from("design_versions")
    .select("id", { count: "exact", head: true })
    .in("design_id", ids)
    .gte("created_at", startOfDay.toISOString());
  if (cntErr) throw new Error(cntErr.message);
  return count ?? 0;
}

/**
 * ספירת הרצות הצינור של היום לפרופיל, מפוצלת לפי תוצאה.
 *
 * נספר מ-`generation_runs` (הרצה אמיתית), לא מ-`design_versions`: כל בחירת מועמד
 * יוצרת גרסת `pick` בלי להריץ את המנוע, וספירת גרסאות "אכלה" מכסה על עיון בלבד.
 * `approved` = הצלחה; כל השאר (`rejected`/`error`) = כישלון — אבל התמונה כבר
 * נוצרה ושולם עליה, ולכן לכישלונות מכסה נפרדת משלהם ולא דלת פתוחה לשריפת תקציב.
 */
/** מה קרה בבקשת השריון. `ok` = מותר להריץ. */
export type QuotaVerdict = "ok" | "approved_limit" | "failed_limit";

/**
 * משריין מקום להרצה — בדיקה ורישום בפעולה אחת.
 *
 * הבדיקה הישנה הייתה read-then-act: המונה נקרא, ואז הצינור רץ. N בקשות מקבילות
 * ראו כולן `used < LIMIT` וכולן המשיכו, כלומר התקרה נחצתה בדיוק כשלוחצים עליה.
 * הפעולה האטומית חיה במסד (`reserve_generation`, migration 0017) כי זה המקום
 * היחיד שיכול לסרל את שתיהן.
 *
 * `runId` נגזר מ-`jobId` של הלקוחה, ולכן השריון idempotent: בקשה שמתחדשת אחרי
 * ניתוק אינה צורכת יחידה שנייה על אותה הרצה.
 *
 * **fail-open על היעדר הפונקציה בלבד.** בחלון שבין הפריסה למיגרציה חוזרים
 * לספירה הישנה: תקרה שנחצית תחת מקביליות עדיפה על אתר שאינו מייצר כלום. כשל
 * אחר של המסד נזרק — הוא לא ראיה לכך שיש מכסה.
 */
export async function reserveGeneration(input: {
  runId: string;
  profileId: string;
  approvedLimit: number;
  failedLimit: number;
}): Promise<QuotaVerdict> {
  const sb = supabaseAdmin();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data, error } = await sb.rpc("reserve_generation", {
    p_id: input.runId,
    p_profile: input.profileId,
    p_since: startOfDay.toISOString(),
    p_approved_limit: input.approvedLimit,
    p_failed_limit: input.failedLimit,
  });
  if (!error) return data as QuotaVerdict;
  if (!/reserve_generation|schema cache|does not exist/i.test(error.message)) {
    throw new Error(`reserve generation failed: ${error.message}`);
  }
  console.error("reserve_generation missing, falling back to counting:", error.message);
  const { approved, failed } = await countTodayRunsByOutcome(input.profileId);
  if (approved >= input.approvedLimit) return "approved_limit";
  if (failed >= input.failedLimit) return "failed_limit";
  return "ok";
}

export async function countTodayRunsByOutcome(
  profileId: string,
): Promise<{ approved: number; failed: number }> {
  const sb = supabaseAdmin();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data: designs, error } = await sb
    .from("designs")
    .select("id")
    .eq("profile_id", profileId);
  if (error) throw new Error(error.message);
  const ids = (designs ?? []).map((d) => d.id);
  if (ids.length === 0) return { approved: 0, failed: 0 };
  const base = () =>
    sb
      .from("generation_runs")
      .select("id", { count: "exact", head: true })
      .in("design_id", ids)
      .gte("created_at", startOfDay.toISOString());
  const [approved, failed] = await Promise.all([
    base().eq("status", "approved"),
    base().neq("status", "approved"),
  ]);
  if (approved.error) throw new Error(approved.error.message);
  if (failed.error) throw new Error(failed.error.message);
  return { approved: approved.count ?? 0, failed: failed.count ?? 0 };
}
