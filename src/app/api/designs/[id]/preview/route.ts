import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";
import { handleRouteError } from "@/lib/api";
import { requireDesignAccess } from "@/lib/designAccess";
import { previewOf } from "@/lib/designPreview";

type Params = { params: Promise<{ id: string }> };

/**
 * הציור של עיצוב אחד, לכרטיס ב"העיצובים שלי".
 *
 * מסלול נפרד מ-`/api/designs/[id]` בכוונה: זה מחזיר כמה מאות בתים של path,
 * וההוא מחזיר את **כל** הגרסאות עם ה-SVG וההצעות שלהן — מאות קילובתים לעיצוב.
 * רשימה של שבעה-עשר עיצובים דרך המסלול המלא הייתה מורידה מגה־בתים לטלפון כדי
 * לצייר שבעה-עשר ריבועים קטנים.
 *
 * נשלפת הגרסה הנוכחית, ובהיעדרה האחרונה — זה מה שהלקוחה ראתה לאחרונה.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);

    const q = supabaseAdmin().from("design_versions").select("svg").eq("design_id", id);
    const { data, error } = design.current_version_id
      ? await q.eq("id", design.current_version_id).maybeSingle()
      : await q.order("version_no", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      preview: previewOf((data as { svg: string } | null)?.svg, {
        lengthMm: Number(design.length_mm),
        widthMm: Number(design.width_mm),
      }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
