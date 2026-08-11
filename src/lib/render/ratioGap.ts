import { svgFrame } from "@/lib/geometry/frame";

// הפער בין היחס שהוזמן לבין היחס שהמודל צייר — הדבר שהמסגור בולע בשקט.
//
// **למה זה נמדד.** מודל התמונה אינו מצייר את היחס שמבקשים ממנו; הוא ממלא את
// התא שנותנים לו, והידית היחידה עליו היא צורת התא (`panels.ts`). כשהתא לא
// מסוגל לתת את היחס שהוזמן, המסגור מותח את הדוגמה אופקית עד לאורך שהוזמן —
// וזה עובד. אבל מתיחה גדולה מועכת את הדוגמה: ב-AP-0096 הוזמן 29:1, המודל צייר
// 6.95:1, והמתיחה של ×4.2 שיטחה קו א.ק.ג עד שהוא נפסל ב"צוואר צר מדי".
//
// עד כאן לא היה שדה שאומר את זה. `stretch` חושב לכל מועמד ונשמר על הגרסה,
// אבל לא ברמת ההרצה — ולכן אי אפשר היה לשאול "כמה מההרצות נמתחות, ובכמה",
// ולא "האם מתיחה מנבאת כישלון ולידציה". שתי השאלות האלה הן מה שמכריע אם
// המתכנן צריך להשתנות, ואי אפשר לענות עליהן בלי למדוד קודם.
//
// שלושת המספרים נשמרים על ההרצה ולא נגזרים בקריאה: `plannedRatio` הוא הבטחה
// של המתכנן ברגע התכנון, ושינוי עתידי בקבועים שלו היה משכתב את ההיסטוריה.

export interface RatioGap {
  /** אורך/רוחב של הפריט שהוזמן. */
  orderedRatio: number;
  /** אורך/רוחב שהמודל צייר בפועל, מתוך ה-viewBox שחזר מהמעקב. */
  drawnRatio: number;
  /** פי כמה הדוגמה נמתחת אופקית כדי להגיע לאורך שהוזמן. 1 = בלי עיוות. */
  stretch: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * הפער, מתוך ה-SVG שחזר מהמעקב ומידות ההזמנה.
 *
 * `null` כשאין ממה לגזור אותו — SVG בלי viewBox שמיש, או מידות אפס. זה מצב
 * רגיל (כשל מוקדם, הרצה ישנה), ולא סיבה להפיל כתיבה ליומן.
 */
export function ratioGap(
  cutoutsSvg: string | null | undefined,
  ordered: { lengthMm: number; widthMm: number },
): RatioGap | null {
  const drawn = svgFrame(cutoutsSvg);
  if (!drawn || drawn.widthMm <= 0) return null;
  if (!(ordered.lengthMm > 0) || !(ordered.widthMm > 0)) return null;

  const orderedRatio = ordered.lengthMm / ordered.widthMm;
  const drawnRatio = drawn.lengthMm / drawn.widthMm;
  if (!Number.isFinite(drawnRatio) || drawnRatio <= 0) return null;

  return {
    orderedRatio: round2(orderedRatio),
    drawnRatio: round2(drawnRatio),
    stretch: round2(orderedRatio / drawnRatio),
  };
}

/**
 * מי מהפסים שנחתכו מוצע לבחירה, כשיש יותר ממה שמציגים.
 *
 * מאז 11.8 הייצור נגזר מהיחס ומתקציב הפיקסלים, והתצוגה חסומה ב-`MAX_CANDIDATES`
 * — כלומר יש מה לבחור מתוכו. הקריטריון הוא **קרבה ליחס שהוזמן**: הפס שיצטרך
 * את המתיחה הקטנה ביותר הוא הפס שיישאר הכי קרוב למה שהמודל צייר, וזו בדיוק
 * הפגיעה שנמדדה ב-AP-0096. הבחירה נעשית מה-viewBox בלבד — בלי למסגר, בלי
 * ולידציה ובלי לצאת מה-isolate — ולכן היא זולה גם על עשרים־וחמישה פסים.
 *
 * המדד סימטרי (`|log|`): פס שנמתח ×2 ופס שנדחס בחצי סובלים באותה מידה. פס בלי
 * viewBox שמיש יורד לסוף התור אבל לא נזרק — עדיף מועמד שלא נמדד על אף מועמד.
 *
 * המיון יציב, ולכן פסים שקולים נשארים בסדר שהקופסה החזירה.
 */
export function pickClosestRatio<T>(
  panels: T[],
  svgOf: (panel: T) => string | null | undefined,
  ordered: { lengthMm: number; widthMm: number },
  limit: number,
): T[] {
  if (panels.length <= limit) return panels;
  const scored = panels.map((panel, index) => {
    const gap = ratioGap(svgOf(panel), ordered);
    return { panel, index, score: gap ? Math.abs(Math.log(gap.stretch)) : Infinity };
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.slice(0, limit).map((s) => s.panel);
}

/**
 * מאיזו מתיחה זה מפסיק להיות עיגול והופך לעיוות.
 *
 * 1.5 הוא סף לתצוגה ולא ממצא: הוא נבחר כדי שהיומן יסמן את מה שכדאי להסתכל
 * עליו, לפני שיש מספיק מדידות כדי לדעת איפה הגבול האמיתי. זו בדיוק השאלה
 * שהשדות האלה נועדו לענות עליה.
 */
export const STRETCH_ALERT = 1.5;
