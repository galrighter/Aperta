import { sendMail, mailConfigured, notifyAddress } from "@/lib/mail";
import { failureSpikeMail, stalledJobMail } from "@/lib/mailTemplates";
import { countErrorRunsSince } from "@/lib/db/runs";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { wakeDutyAgent, dutyConfigured } from "./duty";
import { sendTelegram, telegramConfigured } from "./telegram";
import { isQuotaFailure } from "./quota";
import { ApiError } from "@/lib/api";
import { LlmError } from "@/lib/llm/core";

// התראות על יצירה ששבורה עכשיו — כדי שגל יידע מהמערכת, לא מלקוח מתוסכל.
//
// למה זה קיים: ב-10.8 שינוי בווקטורייזר שבר את כל היצירות למשך ארבע שעות.
// כל כשל נרשם ליומן כמו שצריך — ואיש לא הסתכל בו, כי שום דבר לא אמר להסתכל.
// התקלה התגלתה מצילום מסך של לקוח. שני ה"חיישנים" כאן סוגרים בדיוק את הפער
// הזה: רצף כשלים לא-צפויים, והרצה שנתקעה בלי מי שיאסוף אותה.
//
// כמו התראת התקציב: **לעולם לא זורק**. היצירה כבר נכשלה; מה שיכול להיכשל כאן
// הוא הידיעה עליה, ואסור לו להחליף את השגיאה שהלקוח מקבל.

/** מהכשל הלא-צפוי השני בחלון — מייל. הראשון יכול להיות מקרה; שניים הם דפוס. */
const SPIKE_THRESHOLD = 2;
const SPIKE_WINDOW_MINUTES = 15;
/** מייל אחד לשעה לכל היותר — התראה שמגיעה בצרורות מאומנת להימחק. */
const SPIKE_THROTTLE_MS = 60 * 60_000;

/** לאן. כמו התראת התקציב — כתובת ייעודית כשהוגדרה, אחרת תיבת הפניות. */
function alertAddress(): string {
  return process.env.ALERT_TO || notifyAddress();
}

export interface FailureAlertContext {
  runId: string;
  /** `AP-0054` — העיצוב שההרצה נכשלה עליו, כשידוע. */
  designRef?: string | null;
}

/**
 * אילו כשלים נחשבים "יכולים להיות מערכתיים" — כלומר ראויים להזעקה כשהם חוזרים.
 *
 * ההיסטוריה: השער המקורי הזעיק רק על כשל *בלי קוד* (`internal`), בהנחה שקוד
 * מסודר = סיפור מוכר שלא מצריך תורן. תרגיל התורן (11.8) הפריך אותה: טוקן שגוי
 * מול קופסת הרנדר החזיר 401 על **כל** יצירה — תקלה מערכתית מלאה — והתגלגל
 * ל-`render_failed` המסודר, ששני מופעים רצופים שלו לא העירו איש.
 *
 * מה כן מוחרג, ולמה:
 * - תקציב (`isQuotaFailure`) — יש לו התראה ייעודית עם נוסח "לך שלם".
 * - `content_blocked` — דטרמיניסטי לתיאור הספציפי; חוזר על עצמו אצל לקוח אחד
 *   בלי להעיד כלום על האתר.
 * - `render_busy` — הקופסה מלאה; מצב עומס שמתפנה מעצמו, לא שבר.
 * - `LlmError` — כשל מודל בודד; הצינור מנסה שוב בעצמו, וכשל מתמשך של הספק
 *   נתפס ב-canary וב-llm-health.
 */
export function isSystemicFailure(err: unknown): boolean {
  if (isQuotaFailure(err)) return false;
  if (err instanceof LlmError) return false;
  if (err instanceof ApiError) {
    return !["content_blocked", "render_busy"].includes(err.code);
  }
  return true;
}

/**
 * כשל **לא-צפוי** ביצירה — כזה שנרשם `internal`, בלי קוד משלו ובלי סיפור.
 *
 * נשלח רק כשיש דפוס (שני כשלים בחלון), ולכל היותר פעם בשעה: הדדופ רץ דרך
 * `rate_events` — אותה טבלה שמגבילה טפסים — כי "כבר התרעתי בשעה האחרונה"
 * ו"כבר ניסית עשר פעמים בשעה האחרונה" הם בדיוק אותו מנגנון.
 */
export async function alertUnexpectedFailure(err: unknown, ctx: FailureAlertContext): Promise<void> {
  try {
    // שלושת היעדים חולקים את אותם שערים (דפוס + ויסות): מייל לגל, טלגרם,
    // והערת התורן האוטומטי. כשאף אחד מהם לא מוגדר אין למי להתריע — ואין טעם
    // לשאול את המסד. טלגרם נוסף כאן כי מייל לבדו כבר נשתק פעם אחת ליומיים
    // (‏Resend, 7.8) יחד עם כל השאר.
    if (!mailConfigured() && !dutyConfigured() && !telegramConfigured()) return;

    const since = new Date(Date.now() - SPIKE_WINDOW_MINUTES * 60_000).toISOString();
    // הכשל הנוכחי כבר נרשם ליומן (persistRun/markRunError רצים לפניו), ולכן
    // הספירה כוללת אותו: 2 = הנוכחי ועוד אחד לפניו.
    const recent = await countErrorRunsSince(since).catch((e: Error) => {
      console.error("failure spike count failed:", e.message);
      return 0;
    });
    if (recent < SPIKE_THRESHOLD) return;

    // `true` = כבר הותרע בחלון הזה. הקריאה גם רושמת את ההתראה הנוכחית.
    if (await tooManyAttempts("alert:genfail", SPIKE_THROTTLE_MS, 1)) return;

    const reason = err instanceof Error ? err.message : String(err ?? "");
    if (mailConfigured()) {
      const mail = failureSpikeMail({
        count: recent,
        windowMinutes: SPIKE_WINDOW_MINUTES,
        reason,
        runId: ctx.runId,
        designRef: ctx.designRef ?? null,
      });
      const res = await sendMail({ to: alertAddress(), subject: mail.subject, text: mail.text });
      if (!res.ok) console.error("failure spike mail failed:", res.error);
    }

    const lines = [
      `רצף כשלים לא-צפויים ביצירה: ${recent} כשלים ב-${SPIKE_WINDOW_MINUTES} הדקות האחרונות.`,
      `הרצה אחרונה: ${ctx.runId}${ctx.designRef ? ` (עיצוב ${ctx.designRef})` : ""}.`,
      `נוסח הכשל: ${reason.slice(0, 300)}`,
    ];
    await Promise.allSettled([
      // תיאור עובדתי בלבד — הסשן מקבל אותו כקלט לא-אמין (routine-fire-payload)
      // ומצליב מול Ops status לפי docs/AUTOFIX_ROUTINE.md.
      wakeDutyAgent(lines.join("\n")),
      sendTelegram(["🔴 Aperta — היצירה נכשלת ברצף", ...lines].join("\n")),
    ]);
  } catch (e) {
    console.error("failure spike alert failed:", (e as Error).message);
  }
}

/**
 * שלב הטקסט של Story נפל בכל הניסיונות.
 *
 * **למה זה התראה בפני עצמה ולא עוד כשל.** ההרצה לא נכשלה — הלקוחה מקבלת
 * עיצובים, ממודל תמונה חזק יותר, ואינה אמורה להרגיש דבר. כלומר זו תקלה
 * ש**אין לה קורבן שיתלונן**, והיא היחידה מסוגה: שום שער אחר לא ידלק עליה,
 * ובלי ההתראה הזו היא יכולה להימשך ימים כשכל מה שרואים הוא חשבון גדול יותר
 * (המודל החזק ב-high עולה פי 20–50) ועיצובים פחות טובים.
 *
 * הוויסות נדיב יותר משאר ההתראות — פעם בעשרים דקות — כי מדובר במשהו שמתחיל
 * לעלות כסף מהרגע הראשון, ולא בסימפטום של משהו שכבר שבור.
 */
const DESIGN_STAGE_THROTTLE_MS = 20 * 60_000;

export async function alertDesignStageDown(input: {
  runId: string;
  designRef?: string | null;
  attempts: number;
  reason: string;
  fallbackModel: string;
  fallbackQuality: string;
}): Promise<void> {
  try {
    if (!dutyConfigured() && !telegramConfigured()) return;
    // `true` = כבר הותרע בחלון הזה. הקריאה גם רושמת את ההתראה הנוכחית.
    if (await tooManyAttempts("alert:designstage", DESIGN_STAGE_THROTTLE_MS, 1)) return;

    const lines = [
      `שלב הטקסט של Story נפל ב-${input.attempts} ניסיונות רצופים.`,
      `הרצה: ${input.runId}${input.designRef ? ` (עיצוב ${input.designRef})` : ""}.`,
      `היצירה המשיכה עם ${input.fallbackModel} ב-${input.fallbackQuality} — הלקוחה קיבלה תוצאה.`,
      `נוסח הכשל: ${input.reason.slice(0, 300)}`,
    ];
    // שני היעדים במקביל ולא בטור: שניהם עם פסק זמן של 10 שנ׳, והם יושבים
    // בתוך בקשה שהלקוחה ממתינה לה — בטור זה עשרים שניות שנוספות להמתנה.
    await Promise.allSettled([
      // תיאור עובדתי בלבד — הסשן מקבל אותו כקלט לא-אמין (routine-fire-payload)
      // ומצליב מול Ops status לפי docs/AUTOFIX_ROUTINE.md.
      wakeDutyAgent([...lines, "בדוק את מצב ספק ה-LLM ואת lib/story/designStage.ts."].join("\n")),
      sendTelegram(["⚠️ Aperta — שלב הטקסט של Story נפל", ...lines].join("\n")),
    ]);
  } catch (e) {
    console.error("design stage alert failed:", (e as Error).message);
  }
}

/**
 * הרצה שנצפתה תקועה — `running` מעבר לסף, וההתאוששות-בקריאה לא סגרה אותה.
 *
 * זו התשובה ל"אפשר לזהות שיש בעיה ואז להריץ, במקום לתזמן": את הרגע שבו הרצה
 * מתה בלי לכתוב כלום אף אירוע לא מסמן — משהו חייב להסתכל. מה שכן אפשר: ברגע
 * ש**מישהו** הסתכל (הלקוח מושך את מצב ההרצה) והמסקנה היא "תקועה", המייל יוצא
 * מיד — עם קישור להרצת הסריקה בלחיצה — במקום לחכות ל-cron שמזגזג. פעם אחת
 * להרצה: הלקוח מושך כל שנייה וחצי, והתראה על כל משיכה היא הצפה.
 */
export async function alertStalledJob(input: {
  jobId: string;
  designRef?: string | null;
}): Promise<void> {
  try {
    if (!mailConfigured() && !dutyConfigured() && !telegramConfigured()) return;
    if (await tooManyAttempts(`alert:stall:${input.jobId}`, 24 * 60 * 60_000, 1)) return;

    if (mailConfigured()) {
      const mail = stalledJobMail({ jobId: input.jobId, designRef: input.designRef ?? null });
      const res = await sendMail({ to: alertAddress(), subject: mail.subject, text: mail.text });
      if (!res.ok) console.error("stalled job mail failed:", res.error);
    }

    const lines = [
      `הרצת יצירה תקועה: job ${input.jobId}${input.designRef ? ` (עיצוב ${input.designRef})` : ""}.`,
      "נצפתה running מעבר לסף וההתאוששות-בקריאה לא סגרה אותה.",
    ];
    await Promise.allSettled([
      wakeDutyAgent(lines.join("\n")),
      sendTelegram(["⚠️ Aperta — הרצת יצירה תקועה", ...lines].join("\n")),
    ]);
  } catch (e) {
    console.error("stalled job alert failed:", (e as Error).message);
  }
}
