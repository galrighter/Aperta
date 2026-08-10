import { he } from "@/i18n/he";
import { SITE } from "./site.config";
import { orderSummaryText, orderSummaryHtml } from "./orderSummary";
import { mailShell, paragraph, refLine, button, note, textBlockHtml } from "./mailLayout";
import type { OrderRow, OrderStatus } from "./db/orders";

const m = he.mail;

export type InquiryMail = {
  kind: "order" | "contact";
  name: string;
  email: string;
  phone?: string | null;
  /** גוף הפנייה — במסלול ההזמנה אלה שורות הסיכום שהמשפך בנה. */
  message: string;
  /** מספר ההזמנה שהלקוחה רואה על המסך (`AP-0047`), כשיש. */
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
export function orderAckMail(q: InquiryMail): { subject: string; text: string; html: string } {
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

  const html = mailShell(
    [
      paragraph(`${m.orderAckHello} ${q.name},`),
      paragraph(m.orderAckIntro),
      q.orderRef ? refLine(m.orderAckRef, q.orderRef) : "",
      textBlockHtml(q.message),
      paragraph(m.orderAckNext),
    ].join(""),
  );

  return { subject, text, html };
}

/**
 * "העיצוב שלך מוכן" — נשלח על הגרסה הראשונה של עיצוב בלבד.
 *
 * למה זה קיים: היצירה נמשכת דקה ויותר, ומי שסגרה את החלון באמצע לא קיבלה שום
 * חיווי — העיצוב נוצר, נשמר, ופשוט חיכה בשרת בלי שאיש יידע. החלון הקופץ באתר
 * מכסה את מי שחוזרת לאתר; המייל מכסה את מי שלא.
 *
 * **פעם אחת לעיצוב, ולא על כל גרסה.** עריכה היא שינוי שהלקוחה מבקשת בזמן
 * שהיא מול המסך; מייל על כל אחת מהן הופך התראה שימושית לרעש שמסמנים כספאם.
 */
export function designReadyMail(input: {
  name: string;
  /** `AP-0047` — הרפרנס האנושי לעיצוב, כשיש. */
  code: string | null;
  /** הקישור שפותח בדיוק את העיצוב הזה. */
  url: string;
}): { subject: string; text: string; html: string } {
  const ref = input.code ? ` ${input.code}` : "";
  const subject = `${he.site.brand} — ${m.readySubject}${ref}`;

  const text = [
    `${m.readyHello} ${input.name},`,
    "",
    m.readyIntro,
    "",
    input.code ? `${m.readyRef}: ${input.code}` : null,
    `${m.readyCta} ${input.url}`,
    "",
    m.readyNote,
    "",
    m.readySignature,
    SITE.url,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const html = mailShell(
    [
      paragraph(`${m.readyHello} ${input.name},`),
      paragraph(m.readyIntro),
      input.code ? refLine(m.readyRef, input.code) : "",
      // `m.readyCta` נושא נקודתיים בשביל הטקסט הרגיל ("... : https://...") —
      // על כפתור זה נראה כמו שגיאת ניסוח, ולכן מוסר כאן בלבד.
      button(m.readyCta.replace(/[:\s]+$/, ""), input.url),
      note(m.readyNote),
    ].join(""),
  );

  return { subject, text, html };
}

/**
 * משוב על תקלה חוזרת ביצירה — ההתראה לגל.
 *
 * נשלח רק כשמשתמש **בחר** לספר: כל כשל ממילא נכתב ליומן ההרצות, ומייל על כל
 * כשל היה רעש. מה שהמייל הזה מוסיף על היומן הוא שאדם אמיתי נתקע פעמיים ברצף
 * וטרח לדווח — כלומר זה קורה עכשיו, למישהו, בדרך להזמנה.
 */
export function feedbackNotifyMail(input: {
  name: string;
  email: string;
  /** `AP-0054` — העיצוב שנכשל, כשידוע. */
  designRef: string | null;
  /** ההודעה + המזהה הטכני כפי שהוצגו על המסך — הראיה שמצילום מסך היה חסר. */
  errorShown: string;
  /** מה שהמשתמש כתב, אם כתב. */
  message: string;
}): { subject: string; text: string } {
  return {
    subject: `${m.feedbackNotifySubject} — ${input.name}`,
    text: [
      m.feedbackNotifyIntro,
      "",
      `${m.notifyFrom}: ${input.name}`,
      `${m.notifyEmail}: ${input.email}`,
      input.designRef ? `${m.feedbackDesign}: ${input.designRef}` : null,
      `${m.feedbackError}: ${input.errorShown}`,
      "",
      `${m.feedbackUserSaid}:`,
      input.message || m.feedbackUserSaidEmpty,
      "",
      `${m.notifyAdminHint} ${SITE.url}/admin/runs`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  };
}

/**
 * האישור למי ששלח משוב על תקלה.
 *
 * שני דברים חייבים לצאת ממנו: שהדיווח התקבל ומישהו בודק, ושדרך חזרה לעיצוב
 * קיימת ולא אבדה — הקישור פותח את העיצוב בדיוק בנקודה שבה היצירה נכשלה.
 */
export function feedbackAckMail(input: {
  name: string;
  /** `AP-0054` — כשיש עיצוב שנוצר. הכשל יכול לקרות גם לפני שנוצרה רשומה. */
  code: string | null;
  /** הקישור שממשיך את העיצוב מאותה נקודה. */
  url: string;
}): { subject: string; text: string; html: string } {
  const ref = input.code ? ` ${input.code}` : "";
  const subject = `${he.site.brand} — ${m.feedbackAckSubject}${ref}`;

  const text = [
    `${m.feedbackAckHello} ${input.name},`,
    "",
    m.feedbackAckIntro,
    "",
    input.code ? `${m.feedbackAckRef}: ${input.code}` : null,
    `${m.feedbackAckCta} ${input.url}`,
    "",
    m.feedbackAckNote,
    "",
    m.readySignature,
    SITE.url,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const html = mailShell(
    [
      paragraph(`${m.feedbackAckHello} ${input.name},`),
      paragraph(m.feedbackAckIntro),
      input.code ? refLine(m.feedbackAckRef, input.code) : "",
      // הנקודתיים נועדו לשורת הטקסט ("... : https://..."); על כפתור הן שגיאת ניסוח.
      button(m.feedbackAckCta.replace(/[:\s]+$/, ""), input.url),
      note(m.feedbackAckNote),
    ].join(""),
  );

  return { subject, text, html };
}

/**
 * התראת תקציב שנגמר אצל ספק התמונות.
 *
 * הכותרת אומרת את המסקנה ולא את הסימפטום: מי שקורא אותה בטלפון צריך לדעת
 * *מיד* שהיצירה באתר מושבתת ושמה שנדרש הוא תשלום, לא תיקון. הודעת הספק
 * המקורית נשארת בגוף — היא ההוכחה, והיא מה שמבדיל בין תקציב שנגמר לבין תקלה
 * אחרת שנוסחה דומה.
 */
export function quotaAlertMail(input: {
  /** הודעת הכשל כמו שהתקבלה מהקופסה, כולל גוף התשובה של OpenAI. */
  reason: string;
  runId: string;
  /** `AP-0054` — העיצוב שההרצה נכשלה עליו, כשידוע. */
  designRef: string | null;
}): { subject: string; text: string } {
  return {
    subject: `${he.site.brand} — ${m.quotaSubject}`,
    text: [
      m.quotaIntro,
      "",
      input.designRef ? `${m.quotaDesign}: ${input.designRef}` : null,
      `${m.quotaRun}: ${input.runId}`,
      "",
      `${m.quotaReason}:`,
      input.reason.slice(0, 500),
      "",
      m.quotaAction,
      "",
      `${m.notifyAdminHint} ${SITE.url}/admin/runs`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  };
}

/**
 * "חזרנו לאוויר" — למי שנתקע ביצירה ונטש, אחרי שהתקלה תוקנה.
 *
 * נשלח ידנית בלבד (workflow "Comeback mail", אחרי תצוגה מקדימה): "התקלה
 * נפתרה" היא הכרזה של אדם. הגוף לוקח אחריות במפורש — "התקלה הייתה אצלנו" —
 * כי מי שנתקע באמצע יצירה עזב עם הרושם שמשהו אצלו לא עבד.
 */
export function comebackMail(input: {
  name: string;
  /** `AP-0102` — העיצוב שנתקע, כשיש לו מספר. */
  code: string | null;
  /** הקישור שממשיך בדיוק מהנקודה שבה נעצר. */
  url: string;
}): { subject: string; text: string; html: string } {
  const subject = `${he.site.brand} — ${m.comebackSubject}`;

  const text = [
    `${m.comebackHello} ${input.name},`,
    "",
    m.comebackIntro,
    "",
    input.code ? `${m.comebackRef}: ${input.code}` : null,
    `${m.comebackCta} ${input.url}`,
    "",
    m.comebackNote,
    "",
    m.readySignature,
    SITE.url,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const html = mailShell(
    [
      paragraph(`${m.comebackHello} ${input.name},`),
      paragraph(m.comebackIntro),
      input.code ? refLine(m.comebackRef, input.code) : "",
      button(m.comebackCta.replace(/[:\s]+$/, ""), input.url),
      note(m.comebackNote),
    ].join(""),
  );

  return { subject, text, html };
}

/**
 * הקישור להרצה ידנית של סריקת ההרצות התקועות. ניתן להחלפה בלי פריסה
 * (`SWEEP_WORKFLOW_URL`) — כתובת ריפו אינה דבר שכדאי לחרוט בקוד פעמיים.
 */
function sweepWorkflowUrl(): string {
  return (
    process.env.SWEEP_WORKFLOW_URL ||
    "https://github.com/galrighter/Aperta/actions/workflows/sweep-jobs.yml"
  );
}

/**
 * התראת רצף כשלים לא-צפויים. הכותרת אומרת את המסקנה — "יצירות נכשלות עכשיו" —
 * כי מי שקורא אותה בטלפון צריך לדעת שזה שריפה, לא סטטיסטיקה.
 */
export function failureSpikeMail(input: {
  count: number;
  windowMinutes: number;
  /** הודעת הכשל האחרון — הראיה שמכוונת את החיפוש. */
  reason: string;
  runId: string;
  designRef: string | null;
}): { subject: string; text: string } {
  return {
    subject: `${he.site.brand} — ${m.failSpikeSubject}`,
    text: [
      m.failSpikeIntro(input.count, input.windowMinutes),
      "",
      input.designRef ? `${m.failSpikeDesign}: ${input.designRef}` : null,
      `${m.failSpikeRun}: ${input.runId}`,
      `${m.failSpikeReason}:`,
      input.reason.slice(0, 500),
      "",
      `${m.notifyAdminHint} ${SITE.url}/admin/runs`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  };
}

/** התראת הרצה תקועה — עם הקישור שסוגר אותה בלחיצה. */
export function stalledJobMail(input: {
  jobId: string;
  designRef: string | null;
}): { subject: string; text: string } {
  return {
    subject: `${he.site.brand} — ${m.stalledSubject}`,
    text: [
      m.stalledIntro,
      "",
      input.designRef ? `${m.stalledDesign}: ${input.designRef}` : null,
      `${m.stalledJob}: ${input.jobId}`,
      "",
      `${m.stalledAction} ${sweepWorkflowUrl()}`,
      "",
      `${m.notifyAdminHint} ${SITE.url}/admin/runs`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  };
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
export function orderCustomerAckMail(o: OrderRow): { subject: string; text: string; html: string } {
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

  const html = mailShell(
    [
      paragraph(`${m.orderAckHello} ${o.name},`),
      paragraph(m.orderAckIntro),
      o.ref ? refLine(m.orderAckRef, o.ref) : "",
      orderSummaryHtml(o),
      paragraph(m.orderAckNext),
    ].join(""),
  );

  return { subject, text, html };
}

/**
 * עדכון סטטוס ללקוחה.
 *
 * **נשלח רק כשמאשרים אותו במפורש** ב-`PATCH /api/orders/<id>` (`notify: true`),
 * ורק על מעבר אמיתי. עד ממשק ניהול ההזמנות הוא לא היה מחווט בכלל (החלטת גל,
 * 29.7): הודעה אוטומטית שווה בדיוק כמו הסטטוס שהיא מדווחת עליו, ואת הסטטוסים
 * אי אפשר לתחזק ברצף מתוך תפריט על כרטיס. עכשיו יש תור עבודה, מסך הזמנה
 * ואישור שמראה את הנוסח לפני השליחה — ולכן ההודעה מחווטת.
 *
 * אותה פונקציה מציגה את התצוגה המקדימה בבק־אופיס (`StatusMoveDialog`): מה
 * שרואים לפני האישור הוא בדיוק מה שיישלח, ולא ניסוח שני שנכתב למסך.
 *
 * `sent` אינו כאן: הוא המצב שבו ההזמנה נולדת, והאישור עליו הוא
 * `orderCustomerAckMail`. חזרה אליו ידנית מהבק־אופיס היא תיקון של גל, לא
 * אירוע שהלקוחה צריכה לשמוע עליו — ולכן `null` פירושו "אל תשלח כלום".
 */
export function orderStatusMail(
  o: OrderRow,
  status: OrderStatus,
): { subject: string; text: string; html: string } | null {
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
    html: mailShell(
      [
        paragraph(`${m.orderAckHello} ${o.name},`),
        paragraph(c.body),
        o.ref ? refLine(m.orderAckRef, o.ref) : "",
      ].join(""),
    ),
  };
}
