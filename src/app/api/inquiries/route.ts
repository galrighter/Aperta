import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import {
  createInquiry,
  listInquiries,
  countRecentFromEmail,
  type InquiryStatus,
  type InquiryKind,
} from "@/lib/db/inquiries";
import { sendMail, mailConfigured, notifyAddress } from "@/lib/mail";
import { notifyMail, orderAckMail, type InquiryMail } from "@/lib/mailTemplates";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";

const MAX_PER_EMAIL_PER_DAY = 10;
// גם לפי IP: המכסה לפי מייל נעקפת בשינוי מחרוזת המייל. 30 לשעה חוסם הצפה בלי
// לפגוע במשתמשת אמיתית שממלאת טופס פעם-פעמיים.
const IP_WINDOW_MS = 60 * 60_000;
const IP_MAX = 30;

const createSchema = z.object({
  kind: z.enum(["order", "contact"]).default("order"),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  productType: z.enum(["bracelet", "ring"]).optional(),
  message: z.string().trim().min(1).max(4000),
  /** מספר ההזמנה שהלקוחה רואה על המסך (`AP-0047`). נשלח מפורשות ולא נחלץ
   *  מגוף ההודעה — חילוץ בביטוי רגולרי מטקסט שנבנה במקום אחר נשבר בשקט
   *  ברגע שמישהו מנסח את השורה מחדש. */
  orderRef: z.string().trim().max(40).optional(),
  // honeypot נגד בוטים — אמור להישאר ריק; אם מולא, מתייחסים כבוט
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, createSchema);

    // בוט מילא את ה-honeypot: מחזירים הצלחה בלי לשמור
    if (body.company) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (await tooManyAttempts(`inquiry:${clientIp(req)}`, IP_WINDOW_MS, IP_MAX)) {
      throw new ApiError("rate_limited", "Too many requests, try again later", 429);
    }

    const recent = await countRecentFromEmail(body.email);
    if (recent >= MAX_PER_EMAIL_PER_DAY) {
      throw new ApiError("rate_limited", "Too many requests from this email today", 429);
    }

    const inquiry = await createInquiry({
      kind: body.kind,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      product_type: body.productType ?? null,
      message: body.message,
    });

    // מכאן והלאה הפנייה כבר שמורה. שום כשל בדואר לא מחזיר שגיאה ללקוחה —
    // ההזמנה התקבלה, ומה שאבד הוא ההתראה. הכיוון ההפוך גרוע בהרבה: לקוחה
    // שרואה "השליחה נכשלה" על הזמנה שנשמרה, ושולחת אותה שוב.
    await notify({
      kind: body.kind,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      message: body.message,
      orderRef: body.orderRef ?? null,
    });

    return NextResponse.json({ ok: true, id: inquiry.id }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * ההתראה לגל, ואישור ללקוחה כשזו הזמנה.
 *
 * השליחה רצה **בתוך** הבקשה ולא ב-`waitUntil`. זה נראה כמו הזדמנות ברורה
 * לעבודת רקע, אבל בריפו הזה כבר נמדד ש-`waitUntil` פשוט לא רץ בייצור:
 * `/api/generate` הועבר אליו, כל יצירה נתקעה בלי שנכתבה שום שורה, ואיש לא ידע
 * — כי לא היה מי שיכתוב את השגיאה. עדיף להמתין שתי בקשות רשת.
 */
async function notify(q: InquiryMail): Promise<void> {
  if (!mailConfigured()) {
    console.error("inquiry notification skipped: no mail provider configured");
    return;
  }

  const admin = notifyMail(q);
  const res = await sendMail({
    to: notifyAddress(),
    subject: admin.subject,
    text: admin.text,
    // תשובה במייל הולכת ללקוחה עצמה ולא לתיבת ה-noreply.
    replyTo: q.email,
  });
  if (!res.ok) console.error("inquiry notification failed:", res.error);

  if (q.kind !== "order") return;
  const ack = orderAckMail(q);
  const ackRes = await sendMail({ to: q.email, subject: ack.subject, text: ack.text });
  if (!ackRes.ok) console.error("order acknowledgement failed:", ackRes.error);
}

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") as InquiryStatus | null;
    const valid: InquiryStatus[] = ["new", "contacted", "closed"];
    const status = statusParam && valid.includes(statusParam) ? statusParam : undefined;
    const kindParam = url.searchParams.get("kind") as InquiryKind | null;
    const kind = kindParam === "order" || kindParam === "contact" ? kindParam : undefined;
    const inquiries = await listInquiries(status, kind);
    return NextResponse.json({ inquiries });
  } catch (err) {
    return handleRouteError(err);
  }
}
