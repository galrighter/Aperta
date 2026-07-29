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

// עדכון הזמנה מהבק־אופיס: סטטוס (ועימו מייל ללקוחה — docs/TODO.md D2) והערה
// פנימית. אדמין בלבד.

const patchSchema = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
  note: z.string().max(2000).nullable().optional(),
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
    let mailed: boolean | null = null;

    if (body.status) {
      const res = await updateOrderStatus(id, body.status as OrderRow["status"]);
      order = res.order;
      // רק מעבר אמיתי מודיע ללקוחה. בחירה חוזרת באותו סטטוס — קליק כפול,
      // רענון — לא אמורה לשלוח לה מייל שני על אותו דבר.
      if (res.changed) mailed = await tellCustomer(order);
    }

    if (body.note !== undefined) order = await updateOrderNote(id, body.note);

    return NextResponse.json({ order, mailed });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** מחזיר האם המייל יצא — כדי שהמסך יוכל לומר "עודכן, ההודעה לא נשלחה". */
async function tellCustomer(order: OrderRow): Promise<boolean> {
  const mail = orderStatusMail(order, order.status);
  // אין נוסח לסטטוס הזה (חזרה ל-sent) — זה תיקון פנימי, לא אירוע ללקוחה.
  if (!mail) return false;
  if (!mailConfigured()) {
    console.error("order status mail skipped: no mail provider configured");
    return false;
  }
  const res = await sendMail({ to: order.email, subject: mail.subject, text: mail.text });
  if (!res.ok) console.error("order status mail failed:", res.error);
  return res.ok;
}
