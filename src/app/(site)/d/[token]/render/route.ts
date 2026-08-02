import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { isShareToken } from "@/lib/shareToken";
import { getShareByToken } from "@/lib/db/shares";
import { signedUrl } from "@/lib/db/storage";

/**
 * תמונת השיתוף של דף `/d/<token>` — ההדמיה שמודל התמונה ייצר.
 *
 * למה מסלול ולא כתובת ישירה ל-storage: ה-bucket פרטי, ו-`signedUrl` פג תוקף
 * אחרי שעה. לינק שנשלח בוואטסאפ צריך להציג תצוגה מקדימה גם בעוד חודש — כתובת
 * חתומה שנצרבה ב-`og:image` הייתה עובדת ביום ששותפה ומתה אחר כך.
 *
 * הבייטים מוזרמים ולא מוחזרים כהפניה: `og:image` נקרא ע"י זחלנים (וואטסאפ,
 * טלגרם, פייסבוק) שלא כולם עוקבים אחרי 302, וכתובת שפגה אינה ניתנת למטמון.
 * כאן הכתובת יציבה, והתוכן — צילום מצב שלא משתנה — נשמר במטמון לשנה.
 */

export const maxDuration = 30;

const IMMUTABLE = "public, max-age=31536000, immutable";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!isShareToken(token)) throw new ApiError("not_found", "No such share", 404);

    const share = await getShareByToken(token);
    // צילום ההדמיה קודם: זה מה שהמשתף ראה על המסך, וזה גם קובץ בסדר גודל
    // שזחלני התצוגה המקדימה מוכנים להוריד. `render_path` הוא הקלט של הצינור
    // ולא הפלט שלו, והוא נשאר כנפילה לשיתוף שנוצר בלי קנבס פעיל.
    const path = share?.preview_path ?? share?.render_path;
    if (!path) throw new ApiError("not_found", "This share has no image", 404);

    const upstream = await fetch(await signedUrl(path, 120));
    if (!upstream.ok || !upstream.body) {
      throw new ApiError("upstream_failed", "Could not read the share image", 502);
    }

    return new NextResponse(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        "cache-control": IMMUTABLE,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
