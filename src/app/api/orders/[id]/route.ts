import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import {
  getOrder,
  updateOrderNote,
  updateOrderStatus,
  ORDER_STATUSES,
  type OrderRow,
} from "@/lib/db/orders";
import { sendMail, mailConfigured } from "@/lib/mail";
import { orderStatusMail } from "@/lib/mailTemplates";

// עדכון הזמנה מהבק־אופיס: סטטוס והערה פנימית. אדמין בלבד.
//
// **ההודעה ללקוחה נשלחת רק כשמבקשים אותה במפורש** (`notify: true`), ורק על
// מעבר אמיתי. זה הסדר שגל קבע ב-29.7: הודעה אוטומטית שווה בדיוק כמו הסטטוס
// שהיא מדווחת עליו, ולכן היא חיכתה לממשק ניהול שמחזיק את הסטטוסים מעודכנים
// (docs/TODO.md D4). עכשיו הממשק קיים, וההודעה מחווטת אליו — אבל לא כתופעת
// לוואי של שמירה: היא יוצאת מהמסך שבו אישרו אותה, אחרי שראו את הנוסח.
//
// שתי הגנות שנשארות בשרת ולא נסמכות על המסך:
//   · `changed` — בחירה חוזרת באותו סטטוס אינה מעבר, ורענון או קליק כפול לא
//     מוציאים מייל שני על אותו דבר.
//   · כשל דואר אינו מפיל את העדכון. הסטטוס נשמר, והמסך מקבל `notifyError` —
//     הכיוון ההפוך היה מבטל שמירה שכבר קרתה.

const patchSchema = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
  note: z.string().max(2000).nullable().optional(),
  /** לשלוח ללקוחה הודעה על המעבר. ברירת המחדל: לא. */
  notify: z.boolean().optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await params;
    return NextResponse.json({ order: await getOrder(id) });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    let order = await getOrder(id);
    let changed = false;
    if (body.status) {
      const res = await updateOrderStatus(id, body.status as OrderRow["status"]);
      order = res.order;
      changed = res.changed;
    }
    if (body.note !== undefined) order = await updateOrderNote(id, body.note);

    // הסדר חשוב: קודם נשמר, ואז מודיעים. מייל על סטטוס שלא נשמר הוא הבטחה
    // שאין לה כיסוי במסד.
    const mail = body.notify && changed ? await notifyCustomer(order) : null;

    return NextResponse.json({
      order,
      changed,
      notified: mail?.sent ?? false,
      notifyError: mail?.error ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * ההודעה ללקוחה על המעבר. `sent: false` עם `error: null` פירושו "אין נוסח
 * לסטטוס הזה" — חזרה ל-`sent` היא תיקון של גל, לא אירוע שהלקוחה צריכה לשמוע
 * עליו, ו-`orderStatusMail` מחזיר `null` בדיוק בשבילו.
 */
async function notifyCustomer(order: OrderRow): Promise<{ sent: boolean; error: string | null }> {
  const mail = orderStatusMail(order, order.status);
  if (!mail) return { sent: false, error: null };
  if (!mailConfigured()) {
    console.error("order status mail skipped: no mail provider configured");
    return { sent: false, error: "mail_not_configured" };
  }
  const res = await sendMail({ to: order.email, subject: mail.subject, text: mail.text, html: mail.html });
  if (!res.ok) console.error("order status mail failed:", res.error);
  return { sent: res.ok, error: res.ok ? null : res.error };
}
