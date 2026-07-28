import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";
import { handleRouteError } from "@/lib/api";
import { getDesign, getVersion, insertVersion } from "@/lib/db/designs";
import { requireDesignAccess } from "@/lib/designAccess";

// שכפול עיצוב: עותק של שורת העיצוב + הגרסה הנוכחית כגרסה 1 של העותק.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const { data: copy, error } = await supabaseAdmin()
      .from("designs")
      .insert({
        profile_id: design.profile_id,
        name: `${design.name} (עותק)`,
        product_type: design.product_type,
        length_mm: design.length_mm,
        width_mm: design.width_mm,
        gap_mm: design.gap_mm,
        thickness_mm: design.thickness_mm,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (design.current_version_id) {
      const v = await getVersion(design.current_version_id);
      await insertVersion({
        design_id: copy.id,
        svg: v.svg,
        source: v.source,
        user_prompt: v.user_prompt,
        annotation_png_path: null,
        validation_report: v.validation_report,
        validation_status: v.validation_status,
      });
    }
    const fresh = await getDesign(copy.id);
    return NextResponse.json({ design: fresh }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
