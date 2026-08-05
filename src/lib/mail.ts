import { SITE } from "./site.config";

/**
 * שליחת מייל דרך Resend.
 *
 * REST ולא ה-SDK: ה-Worker רץ על ה-runtime של Cloudflare, ו-`fetch` הוא כל מה
 * שנדרש כאן. תלות אחת פחות בבילד, ואין הפתעות תאימות של חבילה שמניחה Node.
 *
 * **שליחה לעולם אינה מפילה את הפעולה שקראה לה.** פנייה שנשמרה במסד היא פנייה
 * שהתקבלה; אם הדואר נופל, מה שאבד הוא ההתראה — לא ההזמנה. לכן אין כאן `throw`
 * אלא תוצאה, והקורא מחליט. הכיוון ההפוך (מייל שנכשל מחזיר שגיאה ללקוחה
 * שההזמנה שלה כבר נשמרה) הוא הגרוע משניהם.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type MailResult = { ok: true } | { ok: false; error: string };

/**
 * הסוד הוגדר בריפו בשם `RESEND_API`. השם המקובל הוא `RESEND_API_KEY`, ולכן
 * מקבלים את שניהם: סוד שקיים תחת השם השני לא צריך להיראות כמו ספק שלא הוקם —
 * זו בדיוק תקלה שנראית כמו באג ונחקרת שעה.
 */
function apiKey(): string | null {
  const k = process.env.RESEND_API || process.env.RESEND_API_KEY;
  return k && k.length > 8 ? k : null;
}

/** האם יש בכלל ספק דואר מוגדר. */
export function mailConfigured(): boolean {
  return apiKey() !== null;
}

/**
 * כתובת השולח. חייבת להיות על דומיין מאומת ב-Resend — אחרת Resend דוחה את
 * הבקשה, ולא משנה מה כתוב כאן. ניתנת לשינוי בלי פריסת קוד דרך `MAIL_FROM`.
 */
function from(): string {
  // הכתובת חייבת לשבת על הדומיין המאומת ב-Resend. שם התצוגה נשאר שם המותג
  // ("Aperta") — הוא אינו חלק מהחלפת הדומיין, וישתנה בנפרד אם המותג ישתנה.
  return process.env.MAIL_FROM || `Aperta <noreply@aperta-designs.com>`;
}

/** לאן נשלחות ההתראות הפנימיות. */
export function notifyAddress(): string {
  return process.env.MAIL_TO || SITE.contactEmail;
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  /** גרסת HTML מעוצבת, כשיש. `text` תמיד נשלח לצידה — לקוח מייל שלא מציג HTML
   *  (או משתמשת שכיבתה את זה) מקבלת עדיין הודעה קריאה. */
  html?: string;
  replyTo?: string;
}): Promise<MailResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: "mail_not_configured" };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: from(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      // גוף התשובה של Resend הוא מה שמסביר *למה* — דומיין לא מאומת, מפתח
      // פסול, נמען חסום. בלעדיו נשארים עם "500" ובלי דרך לדעת.
      return { ok: false, error: `resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
