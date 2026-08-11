import { sendMail, mailConfigured, notifyAddress } from "@/lib/mail";
import { failureSpikeMail, stalledJobMail } from "@/lib/mailTemplates";
import { countErrorRunsSince } from "@/lib/db/runs";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { wakeDutyAgent, dutyConfigured } from "./duty";

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
 * כשל **לא-צפוי** ביצירה — כזה שנרשם `internal`, בלי קוד משלו ובלי סיפור.
 *
 * נשלח רק כשיש דפוס (שני כשלים בחלון), ולכל היותר פעם בשעה: הדדופ רץ דרך
 * `rate_events` — אותה טבלה שמגבילה טפסים — כי "כבר התרעתי בשעה האחרונה"
 * ו"כבר ניסית עשר פעמים בשעה האחרונה" הם בדיוק אותו מנגנון.
 */
export async function alertUnexpectedFailure(err: unknown, ctx: FailureAlertContext): Promise<void> {
  try {
    // שני היעדים חולקים את אותם שערים (דפוס + ויסות): מייל לגל, והערת התורן
    // האוטומטי. כשאף אחד מהם לא מוגדר אין למי להתריע — ואין טעם לשאול את המסד.
    if (!mailConfigured() && !dutyConfigured()) return;

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

    // תיאור עובדתי בלבד — הסשן מקבל אותו כקלט לא-אמין (routine-fire-payload)
    // ומצליב מול Ops status לפי docs/AUTOFIX_ROUTINE.md.
    await wakeDutyAgent(
      [
        `רצף כשלים לא-צפויים ביצירה: ${recent} כשלים ב-${SPIKE_WINDOW_MINUTES} הדקות האחרונות.`,
        `הרצה אחרונה: ${ctx.runId}${ctx.designRef ? ` (עיצוב ${ctx.designRef})` : ""}.`,
        `נוסח הכשל: ${reason.slice(0, 300)}`,
      ].join("\n"),
    );
  } catch (e) {
    console.error("failure spike alert failed:", (e as Error).message);
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
    if (!mailConfigured() && !dutyConfigured()) return;
    if (await tooManyAttempts(`alert:stall:${input.jobId}`, 24 * 60 * 60_000, 1)) return;

    if (mailConfigured()) {
      const mail = stalledJobMail({ jobId: input.jobId, designRef: input.designRef ?? null });
      const res = await sendMail({ to: alertAddress(), subject: mail.subject, text: mail.text });
      if (!res.ok) console.error("stalled job mail failed:", res.error);
    }

    await wakeDutyAgent(
      [
        `הרצת יצירה תקועה: job ${input.jobId}${input.designRef ? ` (עיצוב ${input.designRef})` : ""}.`,
        "נצפתה running מעבר לסף וההתאוששות-בקריאה לא סגרה אותה.",
      ].join("\n"),
    );
  } catch (e) {
    console.error("stalled job alert failed:", (e as Error).message);
  }
}
