// הסמן של עמוד היומן: איפה נגמר העמוד הקודם, כדי שהעמוד הבא יתחיל בדיוק שם.
//
// שתי סיבות שהוא לא חותמת הזמן לבדה, כמו שהיה:
//
// · **הוא נסע כטקסט גולמי בשורת הכתובת.** חותמת של Postgres נראית
//   `2026-08-03T08:41:00.100019+00:00` — עם `+`, שהוא התו היחיד בקידוד
//   `x-www-form-urlencoded` שמשמעותו רווח כשהוא מגיע לא מקודד. הדפדפן שלח
//   `%2B` כמו שצריך; מה שהגיע ל-Worker היה `+` חשוף, `searchParams` פענח אותו
//   כרווח, וזה מה שיצא ל-Supabase — ונדחה שם, בכל לחיצה על "עוד", עם
//
//     invalid input syntax for type timestamp with time zone:
//       "2026-08-01T15:23:03.156629 00:00"
//
//   כאן הוא נוסע כ-base64url: אותיות, ספרות, `-` ו-`_` בלבד. אין תו שנרמול
//   יכול לגעת בו, והחותמת נפרשת בשרת שלמה.
//
// · **חותמת לבדה אינה מזהה שורה.** שתי הרצות באותה מיקרו-שנייה הן `lt` שמדלג
//   על שתיהן: השורה שלא הוצגה נעלמת מהיומן, וכשגוש כזה יושב על גבול העמוד
//   העמוד הבא חוזר ריק — כפתור "עוד" שנלחץ ולא קורה כלום. הסמן נושא גם את
//   המזהה, וההמשך הוא "מה שקטן מהזוג הזה" — הגדרה שיש בה בדיוק שורה אחת.

export interface RunCursor {
  createdAt: string;
  /** null בסמן ישן (חותמת בלבד), שעדיין מתקבל מלשונית שנפתחה לפני הפריסה. */
  id: string | null;
}

const b64urlEncode = (s: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const b64urlDecode = (s: string): string => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** הסמן שמצביע על השורה האחרונה בעמוד — כלומר להיכן להמשיך. */
export function encodeRunCursor(row: { created_at: string; id: string }): string {
  return b64urlEncode(`${row.created_at}|${row.id}`);
}

/**
 * קריאת הסמן. ערך פגום מוחזר כ-null ולא כשגיאה: התוצאה היא ראש היומן, שהיא
 * תשובה שאפשר להמשיך ממנה — להבדיל ממסך שנשבר על פרמטר.
 */
export function decodeRunCursor(raw: string | null | undefined): RunCursor | null {
  if (!raw) return null;
  let text: string;
  try {
    text = b64urlDecode(raw);
  } catch {
    return null;
  }
  const sep = text.lastIndexOf("|");
  if (sep === -1) return null;
  const createdAt = text.slice(0, sep);
  const id = text.slice(sep + 1);
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

/**
 * סמן ישן: `before=<חותמת>` מלשונית שנפתחה לפני הפריסה. חותמת בלי מזהה.
 *
 * והתיקון של הרווח הוא הבאג עצמו: `2026-08-01T15:23:03.156629 00:00` הוא מה
 * שהגיע לכאן בפועל אחרי ש-`+` נסע לא מקודד, וזה מה ש-Postgres דחה. אצל לשונית
 * ישנה זה עדיין מה שיישלח, ולכן המרחק בין "רווח לפני אזור הזמן" ל"פלוס" נסגר
 * כאן ולא מושאר לשאילתה.
 */
export function legacyRunCursor(before: string | null | undefined): RunCursor | null {
  if (!before) return null;
  const repaired = before.replace(/ (\d{2}:?\d{2})$/, "+$1");
  if (Number.isNaN(Date.parse(repaired))) return null;
  return { createdAt: repaired, id: null };
}
