/**
 * העימוד של "העיצובים שלי".
 *
 * הרשימה נפתחת מעל בחירת המוצר, ולכן היא לא יכולה להיות ארוכה כרצונה — אבל גם
 * לחתוך אותה אי אפשר: מי שעיצבה חמישים פריטים צריכה להגיע לכולם, ולא רק
 * לשלושים האחרונים. לכן הכל נשמר, ומה שמוצג הוא עמוד.
 */

/** גודל עמוד. מתחלק ב-2 וב-3 — הרשת היא חד/דו/תלת-טורית לפי רוחב המסך. */
export const SAVED_PAGE_SIZE = 12;

/** מספר העמודים. תמיד לפחות 1, גם ברשימה ריקה — "עמוד 1 מתוך 1". */
export const pageCount = (total: number, size: number = SAVED_PAGE_SIZE): number =>
  Math.max(1, Math.ceil(Math.max(0, total) / size));

/** העמוד שאפשר להציג באמת: אחרי הסרה של עיצוב, העמוד האחרון עלול להתרוקן. */
export const clampPage = (page: number, total: number, size: number = SAVED_PAGE_SIZE): number =>
  Math.min(Math.max(0, page), pageCount(total, size) - 1);

/** פריטי העמוד. `page` מבוסס-אפס. */
export function pageItems<T>(items: T[], page: number, size: number = SAVED_PAGE_SIZE): T[] {
  const p = clampPage(page, items.length, size);
  return items.slice(p * size, p * size + size);
}
