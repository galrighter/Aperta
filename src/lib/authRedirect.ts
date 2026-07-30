/**
 * לאן מחזירים את המשתמש אחרי כניסה.
 *
 * `next` נבנה אצלנו, אבל הוא מגיע חזרה כפרמטר בכתובת ולכן אינו אמין. בלי
 * ההגבלה לנתיב יחסי זהו open redirect: קישור שנראה כמו כניסה לאתר שלנו,
 * ומנחית את מי שלוחץ עליו — אחרי כניסה מוצלחת — באתר של מישהו אחר.
 *
 * `//evil.com` הוא המקרה שנוטים לפספס: הוא מתחיל ב-`/` ובכל זאת מפנה החוצה,
 * כי הדפדפן קורא אותו ככתובת חסרת פרוטוקול.
 */
export const DEFAULT_NEXT = "/design";

export function safeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith("/")) return DEFAULT_NEXT;
  if (raw.startsWith("//")) return DEFAULT_NEXT;
  // `/\evil.com` — חלק מהדפדפנים מנרמלים בקסלאש קדימה.
  if (raw.startsWith("/\\")) return DEFAULT_NEXT;
  return raw;
}

/** מוסיף סימון כשל לנתיב החזרה, בלי לשבור query שכבר קיים בו. */
export function withAuthFailed(next: string): string {
  return `${next}${next.includes("?") ? "&" : "?"}auth=failed`;
}
