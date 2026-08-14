// הודעה לבוט ההתראות של גל בטלגרם, מתוך האפליקציה.
//
// **למה זה קיים בנפרד מה-workflow.** `\.github/workflows/notify-telegram.yml`
// שולח את אותה הודעה, והוא הערוץ שבו התורן האוטומטי מדווח מה תיקן. אבל הוא
// נשלט ב-workflow_dispatch, כלומר מישהו צריך לשגר אותו — וזה בדיוק מה שאין
// ברגע שבו יצירה נופלת. הצינור צריך לדבר ישירות.
//
// הטוקן הוא אותו טוקן: הוא כבר קיים כסוד בריפו, וה-deploy דוחף אותו ל-Worker
// יחד עם השאר. כלומר אין כאן סוד חדש להגדיר.
//
// כמו כל ההתראות: **לעולם לא זורק**. מה שנכשל כאן הוא הידיעה על התקלה, ואסור
// לו להפיל את מה שעוד עובד.

function botToken(): string | null {
  return process.env.TELEGRAM_ALERT_BOT_TOKEN || null;
}

function chatId(): string | null {
  return process.env.TELEGRAM_ALERT_CHAT_ID || null;
}

/** שניהם או כלום. בוט בלי צ'אט הוא הודעה בלי נמען. */
export function telegramConfigured(): boolean {
  return Boolean(botToken() && chatId());
}

/**
 * שולח, או לא עושה כלום כשלא הוגדר.
 *
 * ההשתקה בשקט מכוונת: סביבת פיתוח ותצוגה מקדימה אינן אמורות להתריע, ובלי
 * הסודות אין למי. מה שכן נרשם ללוג הוא כשל **אחרי** שהוגדר — כי אז זו תקלה.
 */
export async function sendTelegram(text: string): Promise<void> {
  try {
    const token = botToken();
    const chat = chatId();
    if (!token || !chat) return;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // בלי parse_mode: הטקסט נושא נוסחי שגיאה של ספקים, ותו אחד של Markdown
      // בתוכם מחזיר 400 ומוחק את ההתראה כולה. טקסט גולמי תמיד עובר.
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`telegram alert failed: HTTP ${res.status}`, (await res.text()).slice(0, 300));
    }
  } catch (e) {
    console.error("telegram alert failed:", (e as Error).message);
  }
}
