import { normalizeSvg } from "@/lib/geometry/normalize";
import { difference, rectPolygon } from "@/lib/geometry/poly";
import { countCuts, mpToPath } from "@/components/create/model";

/**
 * התצוגה המקדימה של עיצוב — אותו ציור שהכרטיס ב"העיצובים שלי" מצייר.
 *
 * עד היום היא נבנתה **רק בדפדפן**: `remember()` שמר את ה-path של החומר
 * ב-localStorage אחרי כל גרסה שחזרה מהמנוע. המשמעות היא שכל עיצוב שהמכשיר הזה
 * לא יצר בעצמו — כלומר כל מה שנמשך מהשרת בכניסה ממכשיר אחר, וכל יצירה שנקטעה
 * באמצע — הופיע ברשימה בלי תמונה ועם "0 חיתוכים". מספיק לנקות אחסון או להיכנס
 * מטלפון אחר כדי שכל הרשימה תיראה ריקה מציור.
 *
 * לכן החישוב עובר לשרת: המקור הוא ה-SVG של הגרסה, שממילא שמור שם.
 */
export interface DesignPreview {
  /** ה-path של החומר במ"מ (מלבן פחות החיתוכים), בדיוק כמו בציור המקומי. */
  path: string;
  lengthMm: number;
  widthMm: number;
  cuts: number;
}

/**
 * `null` על SVG שאינו עומד בחוזה. אין כאן טיפול בשגיאה: תצוגה מקדימה היא נוחות,
 * והכרטיס יודע להציג את עצמו בלעדיה — להפיל בגללה בקשה שלמה יהיה גרוע יותר.
 */
export function previewOf(
  svg: string | null | undefined,
  dims: { lengthMm: number; widthMm: number },
): DesignPreview | null {
  if (!svg) return null;
  const { lengthMm, widthMm } = dims;
  if (!(lengthMm > 0) || !(widthMm > 0)) return null;
  try {
    const n = normalizeSvg(svg, lengthMm, widthMm);
    const material = difference([rectPolygon(0, 0, lengthMm, widthMm)], n.cutUnion);
    const path = mpToPath(material);
    if (!path) return null;
    return { path, lengthMm, widthMm, cuts: countCuts(svg) };
  } catch {
    return null;
  }
}
