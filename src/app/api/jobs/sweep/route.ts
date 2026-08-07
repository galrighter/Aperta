import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { safeEqual } from "@/lib/admin";
import { sweepStalledJobs } from "@/lib/runs/sweep";

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
    // תמיד 200 עם פירוט, גם כשהרצה בודדת נכשלה: המתזמן צריך להבדיל בין
    // "הסריקה לא רצה" לבין "רצה, ואחת מתוך עשר לא הסתדרה".
    return NextResponse.json(report);
  } catch (err) {
    return handleRouteError(err);
  }
}
