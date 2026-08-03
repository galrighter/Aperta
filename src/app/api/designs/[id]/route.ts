import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/db/supabase";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { listVersions } from "@/lib/db/designs";
import { requireDesignAccess } from "@/lib/designAccess";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const versions = await listVersions(id);
    const current = versions.find((v) => v.id === design.current_version_id) ?? null;
    return NextResponse.json({ design, currentVersion: current, versions });
  } catch (err) {
    return handleRouteError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  lengthMm: z.number().positive().optional(),
  widthMm: z.number().positive().optional(),
  gapMm: z.number().positive().optional(),
  thicknessMm: z.number().positive().optional(),
  currentVersionId: z.string().uuid().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireDesignAccess(req, id);
    const body = await parseBody(req, patchSchema);
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.lengthMm !== undefined) update.length_mm = body.lengthMm;
    if (body.widthMm !== undefined) update.width_mm = body.widthMm;
    if (body.gapMm !== undefined) update.gap_mm = body.gapMm;
    if (body.thicknessMm !== undefined) update.thickness_mm = body.thicknessMm;
    if (body.currentVersionId !== undefined) {
      // ודא שהגרסה שייכת לעיצוב
      const { data: v, error: vErr } = await supabaseAdmin()
        .from("design_versions")
        .select("id")
        .eq("id", body.currentVersionId)
        .eq("design_id", id)
        .maybeSingle();
      if (vErr) throw new Error(vErr.message);
      if (!v) throw new ApiError("invalid_version", "Version does not belong to design", 400);
      update.current_version_id = body.currentVersionId;
    }
    const { data, error } = await supabaseAdmin()
      .from("designs")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new ApiError("not_found", "Design not found", 404);
    return NextResponse.json({ design: data });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireDesignAccess(req, id);
    const sb = supabaseAdmin();
    // exports מפנה גם ל-designs וגם ל-versions בלי cascade — מוחקים קודם
    const { error: exErr } = await sb.from("exports").delete().eq("design_id", id);
    if (exErr) throw new Error(exErr.message);
    // ניתוק ה-FK של הגרסה הנוכחית לפני מחיקת הגרסאות
    const { error: unsetErr } = await sb.from("designs").update({ current_version_id: null }).eq("id", id);
    if (unsetErr) throw new Error(unsetErr.message);
    const { error } = await sb.from("designs").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
