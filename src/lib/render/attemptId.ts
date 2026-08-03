/**
 * מזהה הניסיון — נגזר מ-`jobId` של הלקוחה, לא מוגרל.
 *
 * זו הנקודה שעליה נשענת עמידות היצירה לניתוק (docs/C2_RESILIENT_GENERATION.md):
 * הקופסה מחזיקה את ההרצה תחת המזהה הזה, ולכן בקשה חוזרת עם אותו `jobId` אוספת
 * את התוצאה במקום לקנות אותה שוב. מזהה מוגרל היה מייצר job חדש בכל בקשה —
 * כלומר קריאה נוספת למודל התמונה על עבודה ששולמה כבר.
 *
 * מה עוד יוצא מהגזירה:
 * - **נתיבי ההדמיות יציבים.** הם נגזרים מהמזהה, ולכן בקשה מתחדשת מצביעה על
 *   הקבצים שכבר הועלו במקום לכתוב עותק שני לצד השם הישן.
 * - **שורת `generation_runs` יציבה.** הרצה שהתחדשה מעדכנת את השורה שלה במקום
 *   להשאיר שורה יתומה ליד שורה חדשה (`persistRun` הוא upsert).
 *
 * הניסיון השני של אותה בקשה מקבל מזהה אחר — זו התכונה שבגללה היה `Date.now()`
 * בנתיבים מלכתחילה: ניסיון שכותב לאותם קבצים מוחק את הראיות של הראשון.
 */

const NAMESPACE = "forme-generation-attempt";

/**
 * UUID דטרמיניסטי מ-`jobId` ומספר הניסיון.
 *
 * הפורמט הוא UUID תקין (גרסה 8, variant RFC 4122) ולא סתם 32 תווים הקסה:
 * הוא נכתב לעמודת `uuid` ב-`generation_runs` ומגיע לקופסה, ששתיהן דוחות כל דבר
 * אחר. הגיבוב עצמו הוא SHA-256 — כאן לא צריך עמידות קריפטוגרפית, רק שאותו קלט
 * ייתן תמיד אותו מזהה ושני קלטים שונים לא יתנגשו.
 */
export async function deriveAttemptId(jobId: string, attemptNo: number): Promise<string> {
  return uuidFrom(`${NAMESPACE}:${jobId}:${attemptNo}`);
}

/**
 * המזהה שהקופסה מחזיקה תחתיו — מזהה הניסיון **ועוד** טביעת אצבע של הבקשה.
 *
 * הקופסה מחזירה תחת המזהה את מה שכבר רינדרה, בלי להסתכל בגוף הבקשה. אם הלקוחה
 * תשלח את אותו `jobId` עם פרומפט אחר, מזהה שנגזר מה-`jobId` בלבד היה מחזיר לה
 * את הציור הישן — כלומר תשובה שאינה למה שביקשה. טביעת האצבע מונעת בדיוק את זה:
 * בקשה שהשתנתה היא job אחר, וההרצה יוצאת מחדש.
 *
 * זו רשת ביטחון ולא המנגנון: הלקוחה ממחזרת `jobId` רק בניסיון חוזר על אותו
 * קלט. מה שהרשת מבטיחה הוא שגם טעות שם לא תיתן ללקוחה ציור שלא ביקשה.
 */
export async function deriveRenderJobId(attemptId: string, request: string): Promise<string> {
  return uuidFrom(`${NAMESPACE}:render:${attemptId}:${await sha256Hex(request)}`);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function uuidFrom(seed: string): Promise<string> {
  const bytes = new TextEncoder().encode(seed);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const b = digest.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x80; // version 8 — "custom", which is what this is
  b[8] = (b[8]! & 0x3f) | 0x80; // variant RFC 4122
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
