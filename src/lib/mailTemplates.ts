import { he } from "@/i18n/he";
import { SITE } from "./site.config";
import { orderSummaryText } from "./orderSummary";
import type { OrderRow, OrderStatus } from "./db/orders";

const m = he.mail;

export type InquiryMail = {
  kind: "order" | "contact";
  name: string;
  email: string;
  phone?: string | null;
  /** גוף הפנייה — במסלול ההזמנה אלה שורות הסיכום שהמשפך בנה. */
  message: string;
  /** מספר ההזמנה שהלקוחה רואה על המסך (`RM-0047`), כשיש. */
  orderRef?: string | null;
};

/**
 * ההתראה לגל. הכותרת נושאת את השם ואת מספר ההזמנה כי היא מה שנקרא בטלפון
 * ברשימת המיילים, ולפעמים זה כל מה שייקרא.
 */
export function notifyMail(q: InquiryMail): { subject: string; text: string } {
  const order = q.kind === "order";
  const ref = order && q.orderRef ? ` ${q.orderRef}` : "";
  const subject = `${order ? m.notifyOrderSubject : m.notifyContactSubject}${ref} — ${q.name}`;

  const text = [
    order ? m.notifyIntroOrder : m.notifyIntroContact,
    "",
    `${m.notifyFrom}: ${q.name}`,
    `${m.notifyEmail}: ${q.email}`,
    q.phone ? `${m.notifyPhone}: ${q.phone}` : null,
    "",
    q.message,
    "",
    `${m.notifyAdminHint} ${SITE.url}/admin`,
  ]
    // null בלבד — שורה ריקה כאן היא רווח מכוון בין הפסקאות, לא שדה חסר.
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, text };
}

/**
 * האישור ללקוחה. עד היום מספר ההזמנה הופיע על המסך בלבד — מי שסגרה את הטאב
 * נשארה בלי שום אסמכתה שההזמנה נקלטה.
 *
 * הגוף הוא בכוונה אותן שורות שנשלחו אלינו, ולא ניסוח שני: הדבר היחיד שהיא
 * צריכה לאמת הוא שמה שקיבלנו זה מה שהיא ביקשה, ושתי גרסאות של אותו סיכום הן
 * שתי הזדמנויות להיבדל.
 */
export function orderAckMail(q: InquiryMail): { subject: string; text: string } {
  const ref = q.orderRef ? ` ${q.orderRef}` : "";
  const subject = `${he.site.brand} — ${m.orderAckSubject}${ref}`;

  const text = [
    `${m.orderAckHello} ${q.name},`,
    "",
    m.orderAckIntro,
    "",
    q.orderRef ? `${m.orderAckRef}: ${q.orderRef}` : null,
    "",
    q.message,
    "",
    m.orderAckNext,
    "",
    m.orderAckSignature,
    SITE.url,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, text };
}

/* ===== הזמנות (טבלת orders, migration 0011) ===== */

/**
 * ההתראה לגל על הזמנה. אותה כותרת כמו קודם — שם ומספר, כי זה מה שנקרא ברשימת
 * המיילים בנייד — אבל הגוף נגזר מהשורה במסד ולא מטקסט שהדפדפן שלח.
 */
export function orderNotifyMail(o: OrderRow): { subject: string; text: string } {
  const ref = o.ref ? ` ${o.ref}` : "";
  const subject = `${m.notifyOrderSubject}${ref} — ${o.name}`;

  const text = [
    m.notifyIntroOrder,
    "",
    `${m.notifyFrom}: ${o.name}`,
    `${m.notifyEmail}: ${o.email}`,
    o.phone ? `${m.notifyPhone}: ${o.phone}` : null,
    "",
    orderSummaryText(o),
    "",
    `${m.notifyAdminHint} ${SITE.url}/admin`,
  ]
    // null בלבד — שורה ריקה כאן היא רווח מכוון בין הפסקאות, לא שדה חסר.
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, text };
}

/** האישור ללקוחה. אותו סיכום בדיוק — שתי גרסאות הן שתי הזדמנויות להיבדל. */
export function orderCustomerAckMail(o: OrderRow): { subject: string; text: string } {
  const ref = o.ref ? ` ${o.ref}` : "";
  const subject = `${he.site.brand} — ${m.orderAckSubject}${ref}`;

  const text = [
    `${m.orderAckHello} ${o.name},`,
    "",
    m.orderAckIntro,
    "",
    o.ref ? `${m.orderAckRef}: ${o.ref}` : null,
    "",
    orderSummaryText(o),
    "",
    m.orderAckNext,
    "",
    m.orderAckSignature,
    SITE.url,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, text };
}

/**
 * עדכון סטטוס ללקוחה.
 *
 * **לא מחווט לשום מסלול, בכוונה** (החלטת גל, 29.7 — docs/TODO.md D4). הודעה
 * אוטומטית שווה בדיוק כמו הסטטוס שהיא מדווחת עליו, ואת הסטטוסים אי אפשר
 * לתחזק ברצף מתוך תפריט על כרטיס; זה מחכה לממשק ניהול ההזמנות. הנוסח נשאר
 * כאן — ובדוק — כי הוא החלק שלא תלוי בממשק, וכתיבתו מחדש אחר כך רק תסכן ניסוח
 * שונה בין שני המקומות.
 *
 * `sent` אינו כאן: הוא המצב שבו ההזמנה נולדת, והאישור עליו הוא
 * `orderCustomerAckMail`. חזרה אליו ידנית מהבק־אופיס היא תיקון של גל, לא
 * אירוע שהלקוחה צריכה לשמוע עליו — ולכן `null` פירושו "אל תשלח כלום".
 */
export function orderStatusMail(
  o: OrderRow,
  status: OrderStatus,
): { subject: string; text: string } | null {
  const copy: Partial<Record<OrderStatus, { subject: string; body: string }>> = {
    approved: { subject: m.statusSubjectApproved, body: m.statusBodyApproved },
    in_production: { subject: m.statusSubjectProduction, body: m.statusBodyProduction },
    shipped: { subject: m.statusSubjectShipped, body: m.statusBodyShipped },
    cancelled: { subject: m.statusSubjectCancelled, body: m.statusBodyCancelled },
  };
  const c = copy[status];
  if (!c) return null;

  const ref = o.ref ? ` ${o.ref}` : "";
  return {
    subject: `${he.site.brand} — ${c.subject}${ref}`,
    text: [
      `${m.orderAckHello} ${o.name},`,
      "",
      c.body,
      "",
      o.ref ? `${m.orderAckRef}: ${o.ref}` : null,
      "",
      m.orderAckSignature,
      SITE.url,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  };
}
