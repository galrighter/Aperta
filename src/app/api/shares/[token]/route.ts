import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { isShareToken } from "@/lib/shareToken";
import { getShareByToken } from "@/lib/db/shares";

/**
 * הצילום הציבורי של שיתוף.
 *
 * מסלול ציבורי בכוונה — הטוקן *הוא* ההרשאה, וזה בדיוק מה שדף השיתוף כבר מציג.
 * מה שיוצא כאן הוא רשימה סגורה של שדות: סוג המוצר, המידות והמספר הסידורי,
 * כלומר מה שהמסע צריך כדי להיפתח על העיצוב הנכון. מה שאינו יוצא — ה-SVG,
 * דוח הוולידציה, הפרומפט של המשתמש ומזהה העיצוב — אינו חסר לאיש כאן, וכל אחד
 * מהם הוא דבר שהבעלים לא התכוון למסור כשלחץ "שיתוף".
 */

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!isShareToken(token)) throw new ApiError("not_found", "No such share", 404);

    const share = await getShareByToken(token);
    if (!share) throw new ApiError("not_found", "No such share", 404);

    return NextResponse.json({
      token: share.token,
      productType: share.product_type,
      lengthMm: Number(share.length_mm),
      widthMm: Number(share.width_mm),
      gapMm: Number(share.gap_mm),
      serial: share.serial,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
