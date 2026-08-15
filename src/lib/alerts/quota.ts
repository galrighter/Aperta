import { ApiError } from "@/lib/api";
import { sendMail, mailConfigured, notifyAddress } from "@/lib/mail";
import { quotaAlertMail } from "@/lib/mailTemplates";
import { countQuotaFailuresSince } from "@/lib/db/runs";
import { sendTelegram, telegramConfigured } from "./telegram";

// התראה על תקציב שנגמר אצל ספק התמונות.
//
// למה זה קיים: ב-30.7.26 נגמר התקציב ב-OpenAI, וכל יצירה נכשלה. שום דבר במערכת
// לא אמר את זה — הקופסה החזירה 502, Cloudflare החליף את הגוף בעמוד השגיאה שלו,
// וביומן נרשם "Render service returned non-JSON (502): error code: 502". התקלה
// היחידה שאי אפשר לפתור בקוד, ושדורשת שמישהו יידע עליה תוך דקות, הייתה גם
// היחידה שהמערכת לא ידעה לספר עליה. הסטטוס תוקן בקופסה (422, שהקצה מעביר
// כמות שהוא) — וכאן נשלח המייל.

/** כמה זמן אחורה נחשב "כבר התרעתי". התקציב לא מתמלא מעצמו, ומייל לכל לקוחה
 *  שמנסה ליצור בינתיים הוא הצפה שמסתיימת בהתעלמות. */
const ALERT_WINDOW_MINUTES = 60;

/** לאן נשלחת ההתראה. `MAIL_TO` הוא תיבת הפניות של האתר; התראת תקציב היא לא
 *  פנייה של לקוחה אלא קריאה לפעולה, ולכן יש לה כתובת משלה. */
function alertAddress(): string {
  return process.env.ALERT_TO || notifyAddress();
}

/**
 * האם הכשל הזה הוא תקציב שנגמר.
 *
 * הקוד `quota_exhausted` מגיע מהקופסה, שקוראת את גוף ה-429 של OpenAI — זה
 * המקור האמין. הביטוי הוא רשת ביטחון לקופסה שעוד לא נפרסה ולכשל שנוסח אחרת:
 * המחיר של פספוס (אף אחד לא יודע שהאתר מושבת) גדול מהמחיר של מייל מיותר.
 */
export function isQuotaFailure(err: unknown): boolean {
  if (err instanceof ApiError && err.code === "quota_exhausted") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /insufficient_quota|billing_hard_limit|exceeded your current quota/i.test(message);
}

export interface QuotaAlertContext {
  runId: string;
  /** מספר העיצוב שהלקוחה רואה (`AP-0054`), כשיש — הוא מה שמקשר בין המייל ליומן. */
  designRef?: string | null;
  /** מתי ההרצה שנכשלה התחילה. גם חלון הכפילות נמדד ממנה. */
  startedAt: number;
}

/**
 * שולח את ההתראה, פעם אחת לחלון. **לעולם לא זורק**: היצירה כבר נכשלה, ומה
 * שיכול להיכשל כאן הוא רק הידיעה עליה — אסור לו להחליף את השגיאה שהלקוחה
 * מקבלת בשגיאה אחרת.
 */
export async function alertQuotaExhausted(err: unknown, ctx: QuotaAlertContext): Promise<void> {
  try {
    // **שני ערוצים, לא אחד.** ‏7.8 הוכיח את הצורה הגרועה של זה: מפתח Resend
    // פג, ואז גם המיילים ללקוחות וגם ההתראות על עצמם נשתקו יחד — במשך ימים.
    // ערוץ שמתריע על עצמו דרך עצמו אינו ערוץ התראה. טלגרם יושב על תשתית
    // אחרת לגמרי (docs/FULL_AUDIT_2026-08.md, פרק 7, ממצא 2).
    if (!mailConfigured() && !telegramConfigured()) return;

    // ההרצה שנכשלה כבר נכתבה ליומן, ולכן החלון נמדד עד *תחילתה*: כשל תקציב
    // קודם בשעה האחרונה פירושו שהמייל כבר יצא, ואין מה לחזור עליו.
    //
    // כשל בשאילתה נחשב "לא התרעתי": מייל כפול הוא הטרדה, מייל שלא נשלח הוא
    // אתר מושבת שאיש לא יודע עליו. אלה לא שני צדדים שקולים.
    const since = new Date(ctx.startedAt - ALERT_WINDOW_MINUTES * 60_000).toISOString();
    const earlier = await countQuotaFailuresSince(since, new Date(ctx.startedAt).toISOString()).catch(
      (e: Error) => {
        console.error("quota alert dedupe failed, sending anyway:", e.message);
        return 0;
      },
    );
    if (earlier > 0) return;

    const reason = err instanceof Error ? err.message : String(err ?? "");
    const mail = quotaAlertMail({ reason, runId: ctx.runId, designRef: ctx.designRef ?? null });

    // במקביל ולא בטור: זה יושב בתוך בקשה שהלקוחה ממתינה לה.
    await Promise.allSettled([
      mailConfigured()
        ? sendMail({ to: alertAddress(), subject: mail.subject, text: mail.text }).then((res) => {
            if (!res.ok) console.error("quota alert mail failed:", res.error);
          })
        : Promise.resolve(),
      sendTelegram(
        [
          "🔴 Aperta — התקציב אצל ספק התמונות נגמר. אף יצירה לא עוברת.",
          `הרצה: ${ctx.runId}${ctx.designRef ? ` (עיצוב ${ctx.designRef})` : ""}.`,
          `נוסח הכשל: ${reason.slice(0, 300)}`,
        ].join("\n"),
      ),
    ]);
  } catch (e) {
    console.error("quota alert failed:", (e as Error).message);
  }
}
