import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { createSampleDesign, getDesign, getVersion, insertVersion } from "@/lib/db/designs";
import { requireDesignAccess } from "@/lib/designAccess";

// שכפול עיצוב: עותק של שורת העיצוב + הגרסה הנוכחית כגרסה 1 של העותק.
//
// 0018 — העותק הוא **דוגמה** של עיצוב-האב, לא עיצוב עצמאי חדש: `AP-0085.2`
// ולא `AP-0086` שאין לו קשר נראה ל-0085. יצירת הדוגמה עצמה עברה
// ל-`createSampleDesign` (db/designs) — אותו מנגנון משרת מאז 10.8 גם את
// בקשות השינוי, שכל אחת מהן מקבלת דוגמה ממוספרת משלה.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const copy = await createSampleDesign(design, `${design.name} (עותק)`);

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
