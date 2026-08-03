import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import {
  createOrder,
  listOrders,
  countRecentOrdersFromEmail,
  ORDER_STATUSES,
  type OrderRow,
  type OrderStatus,
} from "@/lib/db/orders";
import { getDesign, getVersion } from "@/lib/db/designs";
import { designCode } from "@/lib/designCode";
import { priceFor } from "@/lib/pricing";
import { sendMail, mailConfigured, notifyAddress } from "@/lib/mail";
import { orderNotifyMail, orderCustomerAckMail } from "@/lib/mailTemplates";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";

// ההזמנה עצמה (docs/TODO.md B1–B3). מסלול ציבורי ליצירה, אדמין לקריאה.
//
// שלושה דברים שהמסלול הזה עושה אחרת מ-`/api/inquiries`, וכולם אותה החלטה —
// שהשרת יחזיק את האמת ולא הדפדפן:
//   · **המחיר מחושב כאן** מ-`lib/pricing`, מאותה פונקציה שהמשפך מציג. מחיר
//     שהדפדפן שולח הוא מחיר שאפשר לזייף, וגם כשאיש לא מזייף — הוא ניתוק בין
//     מה שהוצג למה שנשמר.
//   · **מזהה העיצוב מאומת** מול המסד, ומספר ההזמנה נגזר מה-serial שם ולא
//     מהמחרוזת שהלקוח שלח.
//   · **הסיכום נבנה מהשורה** (lib/orderSummary), כך שההתראה אלינו והאישור
//     ללקוחה הם בהכרח אותו טקסט.

const MAX_PER_EMAIL_PER_DAY = 10;

const createSchema = z.object({
  designId: z.string().uuid().nullable().optional(),
  versionId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  street: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  zip: z.string().trim().max(20).optional(),
  productType: z.enum(["bracelet", "ring"]),
  circumferenceMm: z.number().positive().max(400),
  widthMm: z.number().positive().max(100),
  fit: z.enum(["tight", "regular", "loose"]).optional(),
  density: z.enum(["low", "medium", "high"]).default("medium"),
  cuts: z.number().int().min(0).max(10_000).optional(),
  brief: z.string().trim().max(4000).optional(),
  // honeypot נגד בוטים — אמור להישאר ריק
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, createSchema);

    // בוט מילא את ה-honeypot: מחזירים הצלחה בלי לשמור.
    if (body.company) return NextResponse.json({ ok: true }, { status: 201 });

    // לפי IP (30 לשעה) לצד לפי מייל: המכסה לפי מייל נעקפת בשינוי המחרוזת, וכל
    // הזמנה שולחת שני מיילים דרך Resend — וקטור הצפה/reflection.
    if (await tooManyAttempts(`order:${clientIp(req)}`, 60 * 60_000, 30)) {
      throw new ApiError("rate_limited", "Too many requests, try again later", 429);
    }

    if ((await countRecentOrdersFromEmail(body.email)) >= MAX_PER_EMAIL_PER_DAY) {
      throw new ApiError("rate_limited", "Too many orders from this email today", 429);
    }

    // העיצוב, אם נמסר. הזמנה בלי עיצוב עדיין נשמרת — הלקוחה השלימה משפך
    // והכסף אמיתי גם אם המזהה אבד — אבל מזהה **שגוי** לא נשמר כאילו הוא נכון.
    let ref: string | null = null;
    let profileId: string | null = null;
    let versionId: string | null = null;
    if (body.designId) {
      const design = await getDesign(body.designId);
      ref = designCode(design.serial ?? null);
      profileId = design.profile_id;
      // הגרסה שהוזמנה. אם לא נמסרה — הנוכחית. אם נמסרה גרסה של עיצוב אחר, היא
      // נזרקת: קובץ חיתוך של מישהו אחר הוא הטעות היקרה ביותר כאן.
      const candidate = body.versionId ?? design.current_version_id;
      if (candidate) {
        const version = await getVersion(candidate).catch(() => null);
        versionId = version && version.design_id === design.id ? version.id : null;
      }
    }

    const price = priceFor({
      productType: body.productType,
      widthMm: body.widthMm,
      density: body.density,
    });

    const order = await createOrder({
      ref,
      design_id: body.designId ?? null,
      version_id: versionId,
      profile_id: profileId,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      street: body.street ?? null,
      city: body.city ?? null,
      zip: body.zip ?? null,
      product_type: body.productType,
      circumference_mm: body.circumferenceMm,
      width_mm: body.widthMm,
      fit: body.fit ?? null,
      cuts: body.cuts ?? null,
      brief: body.brief ?? null,
      price,
    });

    // מכאן ההזמנה שמורה. שום כשל בדואר לא מחזיר שגיאה ללקוחה — מה שאבד הוא
    // ההתראה, לא ההזמנה; הכיוון ההפוך גורם לה לשלוח שוב.
    await notify(order);

    return NextResponse.json({ ok: true, id: order.id, ref: order.ref, price }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * ההתראה לגל, והאישור ללקוחה.
 *
 * רץ **בתוך** הבקשה ולא ב-`waitUntil`, כמו ב-`/api/inquiries`: בריפו הזה כבר
 * נמדד ש-`waitUntil` לא רץ בייצור, ואז אין מי שיכתוב אפילו את השגיאה.
 */
async function notify(order: OrderRow): Promise<void> {
  if (!mailConfigured()) {
    console.error("order notification skipped: no mail provider configured");
    return;
  }

  const admin = orderNotifyMail(order);
  const res = await sendMail({
    to: notifyAddress(),
    subject: admin.subject,
    text: admin.text,
    // תשובה במייל הולכת ללקוחה עצמה ולא לתיבת ה-noreply.
    replyTo: order.email,
  });
  if (!res.ok) console.error("order notification failed:", res.error);

  const ack = orderCustomerAckMail(order);
  const ackRes = await sendMail({ to: order.email, subject: ack.subject, text: ack.text });
  if (!ackRes.ok) console.error("order acknowledgement failed:", ackRes.error);
}

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url);
    const param = url.searchParams.get("status") as OrderStatus | null;
    const status = param && ORDER_STATUSES.includes(param) ? param : undefined;
    return NextResponse.json({ orders: await listOrders(status) });
  } catch (err) {
    return handleRouteError(err);
  }
}
