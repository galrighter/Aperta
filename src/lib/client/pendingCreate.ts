"use client";

/**
 * שמירת מצב המשפך לרוחב מסע ה-OAuth.
 *
 * הכניסה עם גוגל יוצאת מהאתר וחוזרת אליו — כלומר **טוענת את העמוד מחדש**.
 * המשפך מחזיק את כל מה שהלקוחה מילאה (מוצר, מידות, תיאור, תמונה) ב-state
 * בזיכרון, ולכן בלי השמירה הזו היא הייתה חוזרת מגוגל למסך ריק, אחרי שכבר
 * בחרה הכול. זה הפער היחיד שאינו נראה בשום טסט ומתגלה רק במסע אמיתי.
 *
 * `sessionStorage` ולא `localStorage`: המצב הזה שייך ללשונית הזו ולמסע הזה.
 */

const KEY = "rmjewel.create.pending";

export function stashCreateState(state: unknown): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // מכסת אחסון או גלישה פרטית. עדיף לחזור למסך ריק מאשר לא להיכנס בכלל.
  }
}

export function popCreateState<T>(): T | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearCreateState(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* אין מה לעשות, ואין מה לדווח */
  }
}
