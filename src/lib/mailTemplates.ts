import { he } from "@/i18n/he";
import { SITE } from "./site.config";

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
