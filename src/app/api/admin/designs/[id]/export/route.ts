import { NextResponse } from "next/server";
import { z } from "zod";
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

const schema = z.object({
  /** גרסה מפורשת — מה שהוזמן. בלעדיה: הגרסה הנוכחית של העיצוב. */
  versionId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await ctx.params;
    // גוף ריק הוא בקשה תקינה ("הגרסה הנוכחית"), ולכן parse סלחני ולא parseBody.
    const body = schema.parse(await req.json().catch(() => ({})));
    const design = await getDesign(id);

    // הזמנה שומרת את הגרסה שהוזמנה, והיא לא בהכרח הנוכחית: אחרי ההזמנה
    // הלקוחה יכולה להמשיך לערוך. לחתוך את "הנוכחית" פירושו לייצר משהו שהיא
    // לא אישרה.
    const versionId = body.versionId ?? design.current_version_id;
    if (!versionId) {
      throw new ApiError("no_version", "Design has no completed version to export", 404);
    }
    const version = await getVersion(versionId);
    if (version.design_id !== design.id) {
      throw new ApiError("bad_version", "Version belongs to a different design", 400);
    }

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
