// הערת התורן האוטומטי — טריגר ה-API של רוטין "APERTA FIX" (החלטת גל, 11.8).
//
// זה החוליה שהופכת את ההתראות מפסיביות לאקטיביות: אותם תנאים ששולחים לגל
// מייל (רצף כשלים לא-צפויים, הרצה תקועה) גם מעירים סשן קלוד שמאבחן, מתקן
// ומאמת לפי docs/AUTOFIX_ROUTINE.md. המייל לגל נשאר — התורן הוא תוספת, לא
// תחליף לידיעה של אדם.
//
// כמו כל ההתראות: **לעולם לא זורק**. היצירה כבר נכשלה; הקריאה הזו היא ידיעה
// עליה, ואסור לה להחליף את השגיאה שהלקוח מקבל.
//
// הקצב כבר מוגבל אצל הקוראים — wakeDutyAgent נקרא רק אחרי אותם שערי דדופ
// של המיילים (פעם בשעה לרצף כשלים, פעם ביום להרצה תקועה) — ולכן אין כאן
// שכבת ויסות נוספת.

/**
 * כתובת ה-fire של הרוטין. המזהה (`trig_...`) אינו סוד — בלי הטוקן אי אפשר
 * לעשות איתו כלום — ולכן ברירת מחדל בקוד עם דריסה ב-env (`DUTY_API_URL`),
 * כמו SWEEP_WORKFLOW_URL: כתובת אינה דבר שכדאי לחרוט פעמיים.
 */
function dutyFireUrl(): string {
  return (
    process.env.DUTY_API_URL ||
    "https://api.anthropic.com/v1/claude_code/routines/trig_013E4NpLhxc6vqU4TCMbfHUm/fire"
  );
}

/**
 * הטוקן שגל יצר ברוטין. בלעדיו — התורן מושבת בשקט, וההתראות במייל ממשיכות.
 *
 * **שני שמות, ובכוונה.** השם המקורי נכתב `DUTI` בשגיאת כתיב (‏`DUTY_API_URL`
 * לצידו נכתב נכון), והוא שמו של ה-secret בפועל — ‏docs/FULL_AUDIT_2026-08.md
 * פרק 1, ממצא 10. שינוי חד-צדדי בקוד היה משתיק את התורן בשקט עד שמישהו
 * ישים לב, וזו התוצאה הגרועה ביותר האפשרית לתיקון קוסמטי.
 *
 * לכן: הכתיב הנכון גובר, והישן ממשיך לעבוד. אפשר להוסיף `DUTY_API_TOKEN`
 * מתי שנוח ולמחוק את `DUTI_API_TOKEN` אחר כך — בלי חלון שבו אף אחד מהם לא
 * עונה.
 */
function dutyToken(): string | null {
  return process.env.DUTY_API_TOKEN || process.env.DUTI_API_TOKEN || null;
}

export function dutyConfigured(): boolean {
  return dutyToken() !== null;
}

/**
 * מעיר את התורן עם תיאור התקלה. הטקסט מגיע לסשן עטוף כ-routine-fire-payload
 * — קלט לא-אמין מבחינתו, ראיה ולא פקודה — ולכן הוא תיאור עובדתי: מה קרה,
 * מתי, ואיפה לחפש. ההוראות עצמן חיות ב-docs/AUTOFIX_ROUTINE.md.
 */
export async function wakeDutyAgent(text: string): Promise<void> {
  try {
    const token = dutyToken();
    if (!token) return;
    const res = await fetch(dutyFireUrl(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`duty wake failed: HTTP ${res.status}`, (await res.text()).slice(0, 300));
    }
  } catch (e) {
    console.error("duty wake failed:", (e as Error).message);
  }
}
