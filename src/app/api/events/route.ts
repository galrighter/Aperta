import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError, ApiError } from "@/lib/api";
import { FUNNEL_EVENTS, recordFunnelEvent } from "@/lib/db/funnel";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";

// חמשת אירועי המשפך, מהדפדפן פנימה (docs/FULL_AUDIT_2026-08.md, פרק 6 §KPIs).
//
// **מסלול ציבורי, ובכוונה חסר-שיניים.** אין כאן שום דבר שאפשר לקרוא, אין
// תשובה שמדליפה מצב, ומה שנכתב הוא אירוע אנונימי מתוך רשימה סגורה. התוקף
// היחיד האפשרי הוא זיהום המספרים, ומולו עומדות שתי הגנות: מגבלת קצב לפי IP,
// והעובדה שהמספרים משמשים להשוואה בין שלבים באותו יום — לא לחשבונאות.
//
// **מה שהמסלול הזה לא רואה, ולא במקרה:** אין שמירת IP, אין user-agent, אין
// עוגייה, ואין מזהה שמחזיק בין ביקורים. ‏`referrerHost` נחתך להוסט בשרת גם
// אם הדפדפן שלח יותר, ו-`path` נחתך מ-query string — פרמטרים נושאים מזהים.
// בזכות זה אין כאן מידע אישי ואין צורך בבאנר עוגיות.

const IP_WINDOW_MS = 60 * 60_000;
/** נדיב: ביקור אחד יורה עד חמישה אירועים, ואדם שמשחק במשפך מגיע ל-30–40. */
const IP_MAX = 300;

const schema = z.object({
  event: z.enum(FUNNEL_EVENTS as unknown as [string, ...string[]]),
  path: z.string().max(200).optional(),
  /** נשלח כ-host או כ-URL מלא; מה שנשמר הוא תמיד ה-host בלבד. */
  referrer: z.string().max(300).optional(),
  utmSource: z.string().max(80).optional(),
  device: z.enum(["mobile", "desktop"]).optional(),
  sessionKey: z.string().max(40).optional(),
  designId: z.string().uuid().optional(),
});

/** ה-host של המפנה, או null. כתובת מלאה יכולה לשאת מזהים אישיים. */
function hostOf(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host || null;
  } catch {
    // כבר host, או זבל. מותר רק מה שנראה כמו host.
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(referrer) ? referrer : null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);

    if (await tooManyAttempts(`event:${clientIp(req)}`, IP_WINDOW_MS, IP_MAX)) {
      throw new ApiError("rate_limited", "Too many events", 429);
    }

    await recordFunnelEvent({
      event: body.event as (typeof FUNNEL_EVENTS)[number],
      // בלי query string. הנתיב מספר איזה עמוד; הפרמטרים מספרים על האדם.
      path: body.path ? body.path.split("?")[0].slice(0, 200) : null,
      referrerHost: hostOf(body.referrer),
      utmSource: body.utmSource ?? null,
      device: body.device ?? null,
      sessionKey: body.sessionKey ?? null,
      designId: body.designId ?? null,
    });

    // 204: אין מה להחזיר, והביקון של הדפדפן ממילא לא קורא את הגוף.
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    // מדידה לעולם לא מפילה דבר אצל הלקוחה — אבל שגיאה כן נרשמת, אחרת
    // "אין נתונים" ו"הכול שקט" נראים אותו דבר.
    return handleRouteError(err);
  }
}
