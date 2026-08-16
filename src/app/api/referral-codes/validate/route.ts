import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError, ApiError } from "@/lib/api";
import { resolveReferralCode, normalizeCode } from "@/lib/db/referralCodes";
import { priceFor } from "@/lib/pricing";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";

// בדיקת קוד הפניה ממסך הצ'קאאוט (0026).
//
// המסלול הזה הוא **נוחות בלבד** — הוא נותן ללקוחה לראות את המחיר לפני שהיא
// לוחצת "שליחה", במקום לגלות בשליחה שהקוד לא נקלט. מה שקובע הוא `/api/orders`,
// שפותר את הקוד בעצמו מחדש; בין הבדיקה כאן לשליחה שם יכולות לחלוף דקות, ובזמן
// הזה המכסה יכולה להיגמר.
//
// **מה שהוא לא מחזיר חשוב לא פחות ממה שהוא כן.** לא הכלל (מחיר קבוע או אחוז),
// לא המכסה שנותרה, ולא הרישום הפנימי — רק "נקלט" והמחיר הסופי. השאר הוא מידע
// עסקי, ותשובה מפורטת כאן היא API לגילוי המחירון של כל חנות.

const schema = z.object({
  code: z.string().trim().min(1).max(64),
  productType: z.enum(["bracelet", "ring"]),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);

    // **הגבלה הדוקה מזו של ההזמנה, ובכוונה.** הקוד הוא מחרוזת קצרה, והמסלול
    // הזה עונה "קיים / לא קיים" — כלומר בלי תקרה הוא כלי לניחוש קודים בסריקה,
    // ומי שינחש קוד פעיל מקבל את המחיר המוזל בלי שאיש הפנה אותו.
    if (await tooManyAttempts(`referral:${clientIp(req)}`, 10 * 60_000, 20)) {
      throw new ApiError("rate_limited", "Too many attempts, try again later", 429);
    }

    const code = normalizeCode(body.code);
    const res = await resolveReferralCode(code);
    if (!res.ok) {
      // 200 ולא 4xx: "הקוד לא מתאים" היא תשובה תקינה לשאלה תקינה, והדפדפן
      // צריך את הסיבה כדי להציג את המשפט הנכון. השגיאות של המסלול (429, 400)
      // נשארות שגיאות.
      return NextResponse.json({ ok: false, reason: res.reason });
    }

    const price = priceFor({ productType: body.productType, referral: { code, rule: res.rule } });
    return NextResponse.json({
      ok: true,
      code,
      label: res.row.public_label,
      // הסכומים שיוצגו. `listBase` נשאר בשרת — מחיר מחוק לצד המחיר שמשלמים
      // הוא בדיוק מה שהקוד נועד למנוע (ראו 0026).
      price: { base: price.base, shipping: price.shipping, total: price.total, vat: price.vat },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
