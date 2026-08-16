/**
 * ‏ה-CSP של האתר.
 *
 * הוא יושב כאן ולא ב-`next.config.ts` מסיבה אחת: `next.config.ts` אינו נטען
 * בבדיקות (הוא קורא ל-`initOpenNextCloudflareForDev` בטעינה), ולכן כל עוד
 * המחרוזת נבנתה שם — אף בדיקה לא יכלה לגעת בה. מדיניות שאף אחד לא בודק היא
 * מדיניות ששוברת מסך ומגלים את זה במסך. `next.config.ts` נשאר הבעלים של
 * הכותרות ומייבא מכאן את המחרוזת בלבד.
 *
 * **מה זה סוגר ומה לא.** ה-CSP כאן אינו נעילה מלאה על סקריפטים: ‏Next מזריק
 * סקריפטים inline (ה-bootstrap וה-hydration data), ואכיפה עליהם דורשת nonce
 * שנוצר בבקשה — כלומר middleware שמזריק אותו לכל תשובה, על runtime שרץ בקצה,
 * ובדיקה של כל מסלול. זה שינוי אמיתי ולא שורה בקונפיג, ולכן `script-src`
 * נשאר עם `'unsafe-inline'` והמסמך הזה אומר זאת במפורש במקום להיראות מוגן.
 *
 * מה שכן נסגר, וזה לא מעט:
 * - **`frame-ancestors 'none'`** — אי אפשר לעטוף את האתר ב-iframe. זו ההגנה
 *   מ-clickjacking על מסך הצ'קאאוט, ואין באתר שום iframe שנשבר מזה (נבדק).
 * - **`form-action 'self'`** — טופס לא יכול להישלח ליעד חיצוני. בלי זה, XSS
 *   שמצליח לשנות `action` שולח את הכתובת והטלפון של הלקוחה למקום אחר.
 * - **`base-uri 'self'`** — הזרקת `<base>` לא יכולה להסיט את כל הנתיבים
 *   היחסיים בעמוד לדומיין של תוקף.
 * - **`object-src 'none'`**, **`default-src 'self'`** — אין תוספים, ואין
 *   טעינה מדומיין שלא הוכרז.
 *
 * **מה מוכרז החוצה, ולמה:** ‏Supabase (אימות מהדפדפן, וההדמיות ב-storage)
 * ו-Cloudflare Insights (הביקון, אם הוגדר טוקן). שניהם נגזרים מהסביבה ולא
 * נכתבים קשיח — דומיין שמשתנה בלי שה-CSP יידע הוא אתר שמפסיק להתחבר בלי הודעה.
 */

const CF_SCRIPT = "https://static.cloudflareinsights.com";
const CF_CONNECT = "https://cloudflareinsights.com";

/** ה-origin של פרויקט ה-Supabase, או `""` כשהמשתנה חסר או אינו כתובת. */
export function supabaseOrigin(url: string | undefined): string {
  try {
    return new URL(url ?? "").origin;
  } catch {
    return "";
  }
}

/**
 * מחרוזת ה-CSP.
 *
 * `origin` ריק (סביבה בלי `NEXT_PUBLIC_SUPABASE_URL`) פשוט לא מוסיף מקור —
 * המדיניות נשארת תקינה, מהודקת יותר, ולא נכתבת עם חור בצורת מחרוזת ריקה.
 */
export function buildCsp({ origin, dev = false }: { origin: string; dev?: boolean }): string {
  const external = (...sources: string[]) => sources.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // blob: — ההדמיה מייצרת תמונות בזיכרון (canvas → blob) לשיתוף ולתצוגה.
    //
    // ‏Supabase כאן הוא ההדמיות עצמן, והוא מה שחסר עד 16.8. הן אינן מוגשות
    // מהדומיין שלנו: מסלול התמונה של היומן
    // (`/api/debug/log/<id>/image/<name>`) מחזיר 302 לכתובת חתומה ב-storage,
    // והסטודיו ומעבדת ההרצה מקבלים כתובת חתומה כמו שהיא. ‏CSP נבדק מחדש על
    // **יעד** ההפניה, ולכן `'self'` לבדו אישר את הבקשה וחסם את התשובה: יומן
    // היצירות הופיע עם ריבוע שבור בכל שורה, בלי שגיאה בשרת ובלי שורה בלוג —
    // הבקשה יצאה, ה-302 חזר, והדפדפן זרק אותו. אותו מקור כבר מוכרז
    // ב-`connect-src`; אין כאן דומיין חדש, רק ההכרזה שהיה חסרה.
    `img-src ${external("'self'", "data:", "blob:", origin)}`,
    "font-src 'self' data:",
    // הפונטים מתארחים עצמית, אבל Next מזריק `<style>` inline לטעינה שלהם.
    "style-src 'self' 'unsafe-inline'",
    // ‏'unsafe-eval' בפיתוח בלבד — ה-refresh runtime של Next משתמש בו.
    `script-src ${external("'self'", "'unsafe-inline'", dev ? "'unsafe-eval'" : "", CF_SCRIPT)}`,
    `connect-src ${external("'self'", origin, CF_CONNECT)}`,
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}
