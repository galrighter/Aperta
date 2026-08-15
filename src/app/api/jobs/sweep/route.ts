import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { safeEqual } from "@/lib/admin";
import { sweepStalledJobs } from "@/lib/runs/sweep";
import { sweepFunnelEvents } from "@/lib/db/funnel";

// הדק של הסריקה שמסיימת הרצות תקועות (`lib/runs/sweep.ts`).
//
// זהו הדק בלבד: כל ההחלטות שם, וכאן רק השער ותשובה שאפשר לקרוא ביומן ההרצות
// של המתזמן. הוא נקרא על ידי מכונה ולא על ידי אדם, ולכן השער הוא כותרת
// `Authorization: Bearer <ADMIN_TOKEN>` ולא עוגיית האדמין — עוגייה נועדה
// לדפדפן, ומתזמן שנדרש לשלוח אותה היה מחקה דפדפן בלי סיבה.
//
// **בלי ADMIN_TOKEN הסריקה מושבתת.** לא פתוחה — מושבתת: מסלול שמריץ עבודה
// שעולה כסף חייב שער, וסוד שלא הוגדר אינו שער.

export const maxDuration = 300;

function requireSweepToken(req: Request): void {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 8) {
    throw new ApiError("admin_disabled", "Sweeping is not configured (set ADMIN_TOKEN)", 503);
  }
  const header = req.headers.get("authorization") ?? "";
  const sent = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!sent || !safeEqual(sent, token)) {
    throw new ApiError("unauthorized", "Sweep authentication required", 401);
  }
}

export async function POST(req: Request) {
  try {
    requireSweepToken(req);
    const report = await sweepStalledJobs();
    // ניקוי אירועי משפך ישנים, על אותו הדק (0023). טבלה שמקבלת כתיבה מכל
    // ביקור ואין מי שמוחק ממנה היא חשבון שגדל בשקט. כשל כאן אינו מפיל את
    // הסריקה — היא הדבר שהלקוחה ממתינה לו, וזה תחזוקה.
    const purgedEvents = await sweepFunnelEvents().catch((e: Error) => {
      console.error("funnel events sweep failed:", e.message);
      return null;
    });
    // תמיד 200 עם פירוט, גם כשהרצה בודדת נכשלה: המתזמן צריך להבדיל בין
    // "הסריקה לא רצה" לבין "רצה, ואחת מתוך עשר לא הסתדרה".
    return NextResponse.json({ ...report, purgedEvents });
  } catch (err) {
    return handleRouteError(err);
  }
}
