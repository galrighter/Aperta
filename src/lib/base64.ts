/**
 * base64 → בייטים.
 *
 * הניסוח המתבקש, `Uint8Array.from(atob(s), (c) => c.charCodeAt(0))`, ישב כאן
 * בארבעה מקומות והוא מלכודת: מחרוזת היא iterable, ולכן `TypedArray.from`
 * בוחרת בפרוטוקול האיטרטור ומקצה תו-תו במקום למלא מערך שגודלו ידוע מראש.
 *
 * נמדד על תמונת השראה של 5MB — התקרה שהמסך מרשה:
 *
 * | | זמן | heap |
 * |---|---|---|
 * | `Uint8Array.from(atob(s), fn)` | 1,921ms | +149MB |
 * | לולאה על המחרוזת הבינארית | 29ms | +5MB |
 *
 * 149MB הם פעולה **בודדת** שחורגת מתקרת ה-128MB של ה-isolate, וה-5MB בשורה
 * השנייה הם התוצאה עצמה. זה לא כיוונון; זה ההבדל בין `exceededResources` לבין
 * תשובה.
 *
 * `atob` ולא `Buffer.from(s, "base64")`, שמהיר עוד יותר (4.6ms): `atob` זורק על
 * קלט פסול, והמפענח של Node מדלג על תווים לא-חוקיים בשקט. מה שעובר כאן הוא
 * קלט של משתמשת — בייטים שמועלים ל-storage ונשלחים למודל — ושקט במקום שגיאה
 * הוא ויתור על ולידציה בשביל 24 מילישניות.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
