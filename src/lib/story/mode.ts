import { FAB } from "@/lib/fabrication.config";
import { svgFrame } from "@/lib/geometry/frame";
import type { DesignDims } from "@/lib/geometry/validate";

// story mode — הצד היחיד של הניסוי שאינו UX טהור, ולכן הוא יושב לבד.
//
// **מה שונה, ולמה.** במסלול הרגיל הלקוחה בוחרת רוחב, והמסגור מותח את מה שהמודל
// צייר אל המסגרת שהוזמנה: קנה מידה אחיד מתקבל רק אם הרוחב האחיד נופל בתוך 5%
// מהמוזמן (`WIDTH_TOLERANCE` ב-geometry/frameCutouts.ts), ומחוץ לטווח הזה
// הרוחב נצמד למוזמן וכל הפער נמתח אופקית. זו התנהגות נכונה שם: הרוחב הוא מידה
// שהלקוחה בחרה וראתה בתצוגה מקדימה.
//
// במסלול Story אין בחירת רוחב בכלל. האורך נקבע מהיקף הגוף — הוא מדידה, ופריט
// באורך אחר פשוט לא נסגר — והרוחב הוא של העיצוב. לכן המתיחה האופקית מיותרת
// כאן: אין מידה שהיא משרתת, יש רק דוגמה שמתעוותת.
//
// **איך זה נעשה בלי לגעת בקוד הגיאומטרי.** לא נוסף שום דגל ל-`frameCutoutsDims`
// ולא לחוזה הבקשה של שירות המסגור — אותו קוד רץ גם ב-geometry-service על
// הקופסה וגם ב-workers/frame, ודגל חדש שם היה מתחיל לפעול רק אחרי שכל אחד מהם
// נפרס מחדש. במקום זה מוסרים לו רוחב מוזמן ש**שווה** לרוחב שקנה המידה האחיד
// מייצר. אז התנאי הקיים מתקיים בדיוק, המסגור בוחר את הרוחב האחיד מעצמו,
// ו-`stretch` חוזר 1.000. המסלול הקיים אינו עובר כאן בכלל.

/** מזהה המצב, כפי שהוא נוסע בבקשות. מחרוזת אחת, בקובץ אחד. */
export const STORY_MODE = "story";

export type StoryMode = typeof STORY_MODE;

/** האם הבקשה הזו היא במסלול Story. */
export const isStory = (mode: string | null | undefined): boolean => mode === STORY_MODE;

/**
 * המידות שמועמד ימוסגר אליהן במסלול Story.
 *
 * האורך הוא מה שהוזמן — הוא נגזר מההיקף שנמדד ואינו נתון למשא ומתן. הרוחב נגזר
 * מהיחס שהמודל **באמת** צייר, ונצבט לטווח הייצור של המוצר
 * (`FAB.products[t].widthRangeMm`) — לא לערך חדש שהומצא כאן.
 *
 * הצביטה היא מקרה הקצה ולא הכלל: היא נכנסת לפעולה רק כשהמודל צייר פריט שאי
 * אפשר לייצר ברוחב שלו, ואז המתיחה שנשארת מדודה ומדווחת ב-`stretch` כרגיל.
 *
 * `svgFrame` שאינו נקרא (SVG בלי viewBox תקין) מחזיר את המידות שהוזמנו כמות
 * שהן — כלומר בדיוק ההתנהגות הקיימת. אין מסלול שבו הפונקציה הזו מחזירה משהו
 * שאי אפשר למסגר אליו.
 */
export function storyFrameDims(ordered: DesignDims, cutoutsSvg: string): DesignDims {
  const drawn = svgFrame(cutoutsSvg);
  if (!drawn || !(drawn.lengthMm > 0) || !(drawn.widthMm > 0)) return ordered;
  if (!(ordered.lengthMm > 0)) return ordered;

  const uniform = (drawn.widthMm * ordered.lengthMm) / drawn.lengthMm;
  return { ...ordered, widthMm: clampWidth(uniform, ordered.productType) };
}

/** רוחב בתוך טווח הייצור של המוצר, מעוגל לשתי ספרות (כמו המסגור עצמו). */
export function clampWidth(widthMm: number, productType: DesignDims["productType"]): number {
  const [lo, hi] = FAB.products[productType].widthRangeMm;
  const bounded = Math.min(hi, Math.max(lo, widthMm));
  return Math.round(bounded * 100) / 100;
}

/** טווח הרוחב שהפרומפט מוסר למודל — אותו טווח, מאותו מקור. */
export const widthRangeOf = (productType: DesignDims["productType"]): [number, number] =>
  FAB.products[productType].widthRangeMm;
