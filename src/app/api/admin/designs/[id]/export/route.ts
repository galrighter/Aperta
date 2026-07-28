import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { getDesign, getVersion } from "@/lib/db/designs";
import { buildVersionExport } from "@/lib/export/build";

// קבצי הייצור של עיצוב, מהבק־אופיס.
//
// עד כאן היה מסלול הורדה אחד — /api/export — והוא נשען על `requireDesignAccess`,
// כלומר על בעלות: הסטודיו מגיע לעיצובים של בודקים, והאתר לעיצוב של בעל העוגייה.
// עיצוב של לקוחה אמיתית לא היה נגיש לאף אחד מהם, ולכן להזמנה שהתקבלה לא הייתה
// שום דרך למשוך את הקובץ שצריך לחתוך. כאן השער הוא `requireAdmin` במקום בעלות.
//
// הגרסה שנלקחת היא ה-current_version_id — הגרסה שהלקוחה בחרה, לא האחרונה
// שנוצרה. אלה לא אותו דבר: אחרי בחירה בגרסה קודמת, "האחרונה" היא מה שנדחה.

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await ctx.params;
    const design = await getDesign(id);
    if (!design.current_version_id) {
      throw new ApiError("no_version", "Design has no completed version to export", 404);
    }
    const version = await getVersion(design.current_version_id);

    // fail חסום גם כאן: קובץ שנכשל בוולידציה הוא קובץ שאי אפשר לחתוך, ולתת
    // אותו להורדה זה להעביר את הכשל לרצפת הייצור. warn עובר — האדמין הוא
    // האישור האנושי — ומסומן בתשובה כדי שהמסך יגיד את זה.
    if (version.validation_status === "fail") {
      throw new ApiError("export_blocked", "Cannot export a design with validation failures", 409);
    }

    const files = await buildVersionExport(design, version, version.validation_status === "warn");
    return NextResponse.json({
      ...files,
      versionNo: version.version_no,
      validationStatus: version.validation_status,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
