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

export async function listVersions(designId: string): Promise<VersionRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("design_versions")
    .select("id, design_id, version_no, source, user_prompt, validation_status, created_at, svg, validation_report, annotation_png_path")
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
}): Promise<VersionRow> {
  const sb = supabaseAdmin();
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
      .insert({ ...v, version_no: nextNo })
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
    if (!/duplicate|unique/i.test(error?.message ?? "")) {
      throw new Error(error?.message ?? "insert version failed");
    }
  }
  throw new Error("Failed to allocate version number");
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
