import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import type { ProductType } from "@/lib/fabrication.config";

export interface DesignRow {
  id: string;
  profile_id: string;
  /** המספר הסידורי (0008) — הרפרנס האנושי (`RM-0047`). null בעיצוב שנוצר
   *  לפני המיגרציה, ו-undefined במסד שעוד לא קיבל אותה. */
  serial: number | null;
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

/**
 * הגשרים שנוצרו אחרי המעקב בגרסה שההרצה הזו שמרה.
 *
 * נקרא מהגרסה ולא מההרצה כי שם הם נכתבו: הם תכונה של הגאומטריה שנשמרה, ושתי
 * הצעות מאותה הרצה מגושרות אחרת. `null` = הרצה בלי גרסה, או גרסה מלפני השדה.
 */
export async function bridgesForRun(generationId: string): Promise<unknown[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("design_versions")
    .select("validation_report")
    .eq("generation_id", generationId)
    .order("version_no", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const report = (data as { validation_report?: { bridges?: unknown[] } }).validation_report;
  return report?.bridges ?? null;
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
 * הוסיפה גרסה, ו-RM-0061 (נמדד) הגיע לשש שורות ביומן על יצירה אחת עם שלוש
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
