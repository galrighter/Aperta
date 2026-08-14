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

/**
 * מודל התמונה והמאמץ שהמסלול הזה רץ בהם — **ניסוי, ובכוונה במקום אחד**.
 *
 * למה זה נדרש. במסלול Story התמונה מחולקת לשלוש שורות, ולכן כל פריט מצויר
 * בפס של בערך 1380×170 פיקסלים — ‎8.6 px/mm על צמיד של 160 מ"מ. שם פתח של
 * 0.5 מ"מ הוא ארבעה פיקסלים, ו-`gpt-image-1-mini` ב-`quality: "low"` מחזיר
 * גושים גדולים במקום עיצוב: מה שראינו על המסך היה מלבן שחור עם שני חיתוכים
 * רחבים, בשלוש הצעות שנבדלו בקושי.
 *
 * ⚠ **המחיר.** נמדד (31/07) מאותה בקשה בדיוק, לפי התמחור של OpenAI:
 *
 *     gpt-image-1-mini · low  · 1536x1024  ≈ $0.0057   ← מה שהיה
 *     gpt-image-1      · high · 1536x1024  ≈ $0.25     ← מה שרץ כאן עכשיו
 *
 * כלומר פי ~44 להרצה. קריאה אחת להרצה, ולכן זו גם העלות להרצה. חל על מסלול
 * Story בלבד — כל שאר ההרצות נשארות על ברירת המחדל הזולה של הקופסה.
 *
 * החזרה היא מחיקת שתי השורות האלה והשימוש בהן ב-`api/generate/route.ts`.
 */
export const STORY_RENDER = {
  model: "gpt-image-1",
  quality: "high",
} as const;

/** האם הבקשה הזו היא במסלול Story. */
export const isStory = (mode: string | null | undefined): boolean => mode === STORY_MODE;

/**
 * המידות שמועמד ימוסגר אליהן במסלול Story.
 *
 * האורך הוא מה שהוזמן — הוא נגזר מההיקף שנמדד ואינו נתון למשא ומתן. הרוחב
 * **נגזר** מהיחס שהמודל באמת צייר, וזהו: קנה המידה הוא של המודל, ואנחנו רק
 * מותחים או מכווצים אותו לאורך הנכון.
 *
 * **הצביטה לטווח הייצור הוסרה** (החלטת גל). קודם הרוחב שנגזר נצבט ל-
 * `FAB.products[t].widthRangeMm` — צמיד 5–80, טבעת 4–18 — ומחוץ לטווח הצביטה
 * הייתה מחזירה את המתיחה האופקית שכל המסלול הזה בא למנוע. נמדד: בטבעת כל יחס
 * מתחת ל-3.3 נצבט, כלומר מתיחה של עד ×1.33 על צורה שהמודל צייר נכון. בצמיד זה
 * כמעט לא נגע.
 *
 * מה שנשאר להגן על הייצור הוא מה שתמיד הגן עליו: הוולידציה. היא רצה על
 * הגאומטריה שאחרי המסגור ופוסלת מה שאי אפשר לחתוך — ופסילה של מועמד היא תשובה
 * טובה יותר מפריט מעוות שעובר בשקט.
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
  // שתי ספרות, כמו המסגור עצמו. זה עיגול ולא צביטה: הפער נשאר הרבה מתחת
  // ל-`WIDTH_TOLERANCE`, ולכן המסגור בוחר את הרוחב האחיד ו-`stretch` הוא 1.000.
  return { ...ordered, widthMm: Math.round(uniform * 100) / 100 };
}

/**
 * טווח הרוחב שהפרומפט מוסר למודל — **בעריכה ובכיתוב בלבד**. ביצירה מאפס
 * הפרומפט של המסלול (lib/story/prompt.ts) אינו מוסר מידות כלל.
 *
 * `actualWidthMm` הוא הרוחב של הפריט שנערך. מאז שהצביטה הוסרה
 * (`storyFrameDims`) הוא יכול לשבת מחוץ לטווח הייצור, ואז המשפט סתר את עצמו:
 * "ברוחב 4 עד 18 מ"מ, כשבערך 24 מ"מ הוא הרגיל". הטווח נפתח כדי להכיל אותו —
 * מה שנערך הוא הפריט שקיים, לא פריט שהיה מותר להיווצר.
 */
export function widthRangeOf(
  productType: DesignDims["productType"],
  actualWidthMm?: number,
): [number, number] {
  const [lo, hi] = FAB.products[productType].widthRangeMm;
  if (!actualWidthMm || !(actualWidthMm > 0)) return [lo, hi];
  return [Math.min(lo, actualWidthMm), Math.max(hi, actualWidthMm)];
}

/* ===== סדר ההצעות: מגוון צורני ===== */

/** מה שנדרש כדי למדוד ריחוק בין שתי הצעות. תת-קבוצה של `FramedPreview`. */
export interface VarietyCandidate {
  report: { metrics?: { openAreaPct?: number } | null } | null;
  /** היחס שהמודל צייר בפועל. במסלול Story הוא **גם** הרוחב שיצא, ולכן הוא
   *  ציר צורני אמיתי ולא מדד תכנוני. */
  drawnRatio: number;
}

/**
 * סידור ההצעות כך שהשונות ביניהן תהיה גלויה — במסלול Story בלבד.
 *
 * **למה זה שונה כאן.** במסלול הרגיל הלקוחה ביקשה עיצוב מסוים, והדירוג שואל
 * "מי הכי קרוב למה שהוזמן" (`|stretch − 1|`). במסלול Story השאלה שהמסך מציג
 * היא אחרת לגמרי: לא "האם זה מה שדמיינתי" אלא "איזו מהפרשנויות האלה הכי שלי".
 * לשאלה הזו, ארבע הצעות שנראות אותו דבר אינן בחירה — הן אשליה של בחירה.
 *
 * **מה נשאר כפי שהוא:** ההצעה הראשונה. היא זו שנשמרת כגרסה ומוצגת ראשונה,
 * והיא נבחרת בדיוק כמו קודם (סטטוס ולידציה, ואז הקרובה ביותר). מה שמשתנה הוא
 * הסדר של **השאר** — מה שהלקוחה גוללת ביניהם.
 *
 * האלגוריתם הוא farthest-first: בכל צעד נבחרת ההצעה הרחוקה ביותר מכל מה שכבר
 * נבחר. שני צירים, ושניהם כבר מחושבים על כל מועמד — אין כאן חישוב גאומטרי נוסף:
 *  - **כמה פתוח** (`openAreaPct`) — ההבדל בין תבנית צפופה לדלילה.
 *  - **איזו פרופורציה** (`drawnRatio`) — ובמסלול הזה גם הרוחב שייצא בפועל.
 * כל ציר מנורמל לטווח שנצפה בפועל, כדי שציר עם מספרים גדולים לא יבלע את השני.
 */
export function orderByVariety<T extends VarietyCandidate>(items: T[]): T[] {
  if (items.length < 3) return items;

  const open = items.map((c) => c.report?.metrics?.openAreaPct ?? 0);
  const ratio = items.map((c) => c.drawnRatio || 0);
  const span = (xs: number[]): number => {
    const d = Math.max(...xs) - Math.min(...xs);
    // טווח אפס = הציר אינו מבחין בין ההצעות. 1 מנטרל אותו במקום לחלק באפס.
    return d > 1e-9 ? d : 1;
  };
  const openSpan = span(open);
  const ratioSpan = span(ratio);
  const dist = (a: number, b: number): number =>
    Math.abs(open[a] - open[b]) / openSpan + Math.abs(ratio[a] - ratio[b]) / ratioSpan;

  const order = [0];
  const left = items.map((_, i) => i).slice(1);
  while (left.length) {
    let best = 0;
    let bestGap = -1;
    for (let k = 0; k < left.length; k++) {
      // הריחוק של מועמד מהקבוצה הוא המרחק ל**קרוב אליו ביותר** בתוכה: מועמד
      // שדומה מאוד לאחד שכבר נבחר אינו מגוון, גם אם הוא רחוק משאר הקבוצה.
      const gap = Math.min(...order.map((j) => dist(left[k], j)));
      if (gap > bestGap) { bestGap = gap; best = k; }
    }
    order.push(left.splice(best, 1)[0]);
  }
  return order.map((i) => items[i]);
}
