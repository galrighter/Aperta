import { NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { getDesignForAdmin } from "@/lib/db/accounts";

// עיצוב אחד לבק־אופיס: הגרסאות שלו, הבעלים והמידות.
//
// השער הוא ADMIN_TOKEN ולא בעלות, כמו בייצוא שלצידו. `/api/designs/[id]`
// מצפה שהפונה יהיה בעל החשבון, ולכן עיצוב של לקוחה אינו נגיש דרכו לאף אחד
// מהמסלולים המזוהים בסטודיו — וזה מה שהשאיר את יומן היצירות בלי דרך להראות
// את העיצוב שההרצה יצרה.
//
// 404 ולא אובייקט ריק על מזהה שאינו קיים: מסך שנפתח על עיצוב שנמחק צריך לומר
// "לא נמצא", לא "טעינה נכשלה".

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await params;
    const detail = await getDesignForAdmin(id);
    if (!detail) throw new ApiError("not_found", "Design not found", 404);
    return NextResponse.json(detail);
  } catch (err) {
    return handleRouteError(err);
  }
}
