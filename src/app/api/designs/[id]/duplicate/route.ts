import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";
import { handleRouteError } from "@/lib/api";
import { getDesign, getVersion, insertVersion, type DesignRow } from "@/lib/db/designs";
import { requireDesignAccess } from "@/lib/designAccess";

// שכפול עיצוב: עותק של שורת העיצוב + הגרסה הנוכחית כגרסה 1 של העותק.
//
// 0018 — העותק הוא **דוגמה** של עיצוב-האב, לא עיצוב עצמאי חדש: `AP-0085.2`
// ולא `AP-0086` שאין לו קשר נראה ל-0085. `root_design_id` מצביע תמיד על
// אב-הקדמון (לא על ההורה המיידי) כדי שמיספור יישאר שטוח — שכפול של דוגמה
// מוליד אח, לא נכד.

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const rootId = design.root_design_id ?? design.id;
    const rootSerial = design.root_serial ?? design.serial;

    let copy: DesignRow | null = null;
    for (let attempt = 0; attempt < 3 && !copy; attempt++) {
      const sampleNo = await nextSampleNo(rootId);
      const { data, error } = await supabaseAdmin()
        .from("designs")
        .insert({
          profile_id: design.profile_id,
          name: `${design.name} (עותק)`,
          product_type: design.product_type,
          length_mm: design.length_mm,
          width_mm: design.width_mm,
          gap_mm: design.gap_mm,
          thickness_mm: design.thickness_mm,
          root_design_id: rootId,
          root_serial: rootSerial,
          sample_no: sampleNo,
        })
        .select("*")
        .single();
      if (data) { copy = data as DesignRow; break; }
      // מירוץ בין שני שכפולים מקבילים מאותו אב — ניסיון נוסף עם מספר עדכני.
      if (!/duplicate|unique/i.test(error?.message ?? "")) throw new Error(error?.message);
    }
    if (!copy) throw new Error("Failed to allocate a sample number");

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
