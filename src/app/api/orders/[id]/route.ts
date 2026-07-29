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

// עדכון הזמנה מהבק־אופיס: סטטוס והערה פנימית. אדמין בלבד.
//
// **הלקוחה אינה מקבלת מייל על שינוי סטטוס** (החלטת גל, 29.7). זה לא ויתור על
// הפיצ'ר אלא סדר נכון: הודעה אוטומטית שווה בדיוק כמו הסטטוס שהיא מדווחת עליו,
// ואת הסטטוסים אי אפשר לתחזק ברצף מתוך תפריט על כרטיס — לשם כך צריך ממשק ניהול
// הזמנות שנבנה לזרימה היומית. הודעה שמבטיחה "נכנס לייצור" על שדה שמתעדכן
// כשנזכרים גרועה משתיקה: היא הופכת מידע ישן להתחייבות. הנוסח בעברית כבר קיים
// (`orderStatusMail`) וממתין לחיווט — docs/TODO.md D4.

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
    if (body.status) {
      order = (await updateOrderStatus(id, body.status as OrderRow["status"])).order;
    }
    if (body.note !== undefined) order = await updateOrderNote(id, body.note);

    return NextResponse.json({ order });
  } catch (err) {
    return handleRouteError(err);
  }
}
