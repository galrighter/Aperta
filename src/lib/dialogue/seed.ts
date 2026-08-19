import { SPEC_FIELDS, type EditSpec } from "./spec";

// dialogue mode — הזרעת המפרט המצטבר מהיצירה (§9.2 ב-DIALOGUE_PLAN).
//
// **מה זה פותר.** המפרט המצטבר מתמלא מסבבי עריכה, ולכן הסבב **הראשון** על
// עיצוב חדש רואה `EDIT_SPEC_NONE` — מודל הטקסט לא יודע מה הפריט הוא, רק מה
// מבקשים לשנות בו. העלות אינה תיאורטית: סבב בלי הקשר הוא סבב פחות מדויק,
// כלומר לקוחה שצריכה עוד סבב — או לקוחה שלא עושה אותו.
//
// אבל המידע כבר קיים. `designStage` ייצר בדיוק את החמישייה הזו ביצירה, לכל
// אחד מ-3–6 הכיוונים, והיא שמורה ב-`RunInputs.designStage.spec`. מה שחסר היה
// **איזה מהם הלקוחה בחרה** — וזה מה ש-`VersionCandidate.designIndex` נושא
// מאז שהוא נצמד לפאנל בזמן היצירה.
//
// **הכול טהור כאן.** השליפה עצמה יושבת ב-`lib/db/runs.ts#editSpecFor`; מה
// שנשאר כאן הוא הפענוח והבחירה, שהם מה שיכול להיות שגוי בשקט ולכן מה שנבדק.

/**
 * החמישייה של כיוון עיצוב מסוים, מתוך ה-JSON ששלב הטקסט החזיר.
 *
 * `null` על כל דבר שאינו ודאי — JSON שאי אפשר לקרוא, אינדקס מחוץ לתחום,
 * כיוון בלי שום שדה. **חסר עדיף על ניחוש**: מפרט של הכיוון הלא נכון אינו
 * "פחות מדויק" אלא הצהרה בטוחה על פריט אחר, ומודל הטקסט יערוך אותה כאילו
 * היא נכונה — כלומר גרוע מלהתחיל ריק.
 *
 * ה-JSON נחתך ב-8,000 תווים כשהוא נשמר ליומן (`RunInputs.designStage.spec`),
 * וחיתוך באמצע הופך אותו לבלתי-קריא. זה נופל כאן כמו כל קלט פסול אחר, וזו
 * ההתנהגות הנכונה: מפרט חתוך אינו מפרט.
 */
export function specFromDesignStage(
  specJson: string | null | undefined,
  designIndex: number | null | undefined,
): EditSpec | null {
  if (!specJson || typeof designIndex !== "number" || !Number.isInteger(designIndex) || designIndex < 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(specJson);
  } catch {
    return null;
  }
  const designs = (parsed as { designs?: unknown })?.designs;
  if (!Array.isArray(designs) || designIndex >= designs.length) return null;
  const chosen = designs[designIndex];
  if (!chosen || typeof chosen !== "object") return null;

  const box = chosen as Record<string, unknown>;
  const out: EditSpec = {};
  for (const [key] of SPEC_FIELDS) {
    const value = box[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * הכיוון שההצעה הנבחרת באה ממנו.
 *
 * `picked_index` הוא מקום במערך ההצעות; `designIndex` שעליו הוא הכיוון
 * במפרט. שתי רמות עקיפין, ושתיהן יכולות להיות ריקות בגרסה ישנה — ואז אין
 * הזרעה, וזה בדיוק המצב שהיה עד עכשיו בכל הרצה.
 *
 * ‏`picked_index` ריק נקרא כ-0: זו ההצעה שנשמרה כגרסה כשהלקוחה לא נגעה
 * בבחירה, וכך גם `chooseCandidate` והמסך משווים אותה.
 */
export function chosenDesignIndex(version: {
  picked_index?: number | null;
  candidates?: Array<{ designIndex?: number }> | null;
}): number | null {
  const picked = version.picked_index ?? 0;
  const chosen = version.candidates?.[picked];
  return typeof chosen?.designIndex === "number" ? chosen.designIndex : null;
}
