import {
  difference, differenceSafe, morphologicalOpen, multiPolygonArea, polygonArea, rectPolygon, simplify,
} from "./poly";
import { rebuildDesign } from "./restoreBridges";
import type { NormalizedDesign } from "./normalize";
import type { MultiPolygon, Polygon } from "./types";

// קוץ — בליטת מתכת דקה מהרצפה שיוצאת מהמתאר ואינה מחזיקה דבר.
//
// **החור שהיה בשלושת המנקים.** לצינור יש שלושה שלבים שנוגעים בגאומטריה, וכל
// אחד מהם מטפל בדיוק במקרה אחד:
//
//   · `restoreBridges` — אי מתכת ש**נותק**. מגשר אותו, או מוחק.
//   · `thickenBridges` — אי שמחובר בחוט. מרחיב את החוט לרצפה.
//   · `dropThinCutouts` — **חיתוך** דק מהמינימום. ממלא אותו במתכת.
//
// מה שאף אחד מהם אינו רואה הוא בליטת מתכת דקה שאינה מחזיקה כלום.
// `thickenBridges` מדלג עליה **במפורש** — "טריז שמתחדד נעלם בקצהו ולא מפריד",
// וזו ההבחנה שמנעה ממנו לסמן את כל הקווים הפנימיים של ה-M ב-AP-0068. V4 עושה
// את אותה הבחנה מאותה סיבה, וגם היא סופרת רכיבים בלבד. ו-`dropThinCutouts`
// מדלג על אזור שנוגע במסגרת (`touchesFrame`), כלומר על הרקע שסביב הצללית —
// ושם בדיוק נוצרים הקוצים.
//
// **מה שנמדד.** AP-0200 (16.8), חלופה 4: שערת מתכת של ‎2.02×0.29 מ"מ יוצאת
// מהמתאר העליון של הטבעת. הוולידציה החזירה `pass` על כל חמש הבדיקות, והיא
// הופיעה על מסך התוצאה כקוץ שבולט מהפס. ‎0.29 מ"מ הם פחות מחצי מ-
// `minLetterBridgeMm` (‎0.75) — הרצפה שהקוד עצמו מכריז עליה כרוחב שמתחתיו מתכת
// נשברת בחיתוך או בגלגול. זו אינה החלטה עיצובית של המודל אלא פרנז' של המעקב.
//
// **הכלל, ולמה הוא אינו מגלח את כל הקטלוג.** פתיחה מורפולוגית בדיסק ברוחב
// הרצפה, וההפרש הוא מה שאינו מסוגל להכיל אותה. עד כאן זה בדיוק החישוב של V4,
// ולבדו הוא רחב מדי — הוא מסמן גם את **קצה** של כל צורה מחודדת, שהרי כל חוד
// דק מהרצפה בקצהו. שלושה שערים מצמצמים אותו למה שדווח:
//
//   · **שטח.** רק חתיכה מעל `drawnArea` — אותו סף עצמו ש-`uncuttableParts`
//     משתמש בו כדי לא לשכתב פינה קמורה על רעש העיגול של הפתיחה. נמדד על
//     AP-0200 חלופה 4: הפתיחה מסירה 39 חתיכות, הקוץ הוא ‎0.39 ממ"ר והבא
//     אחריו ‎0.07 — סדר גודל ביניהם.
//
//   · **דקה לכל אורכה.** קוץ הוא שערה בעובי אחיד; חוד הוא דק רק בקצהו, ובבסיס
//     שלו — במקום שבו הוא נפגש עם הגוף הפתוח — הוא בדיוק ברוחב הרצפה. לכן
//     החתיכה נמדדת בפתיחה **שנייה**, בחצי הרצפה: מה שנעלם גם שם אין בו שום
//     מקום ברוחב סביר, ומה ששורד הוא קצה של צורה שמישהו צייר. השערה של
//     AP-0200 היא ‎0.29 מ"מ לכל אורכה, כלומר מתחת לחצי הרצפה (‎0.375) בכל נקודה.
//
//   · **קשירות.** ראה `shaveSpurs` למטה.

export interface ShaveOptions {
  /** הרצפה. מתכת דקה ממנה אינה שורדת חיתוך (FAB.minLetterBridgeMm). */
  minMaterialMm: number;
  /**
   * מתחת לשטח הזה, חתיכה שהפתיחה הסירה היא העיגול של הפתיחה ולא משהו שצויר.
   *
   * אותה נוסחה כמו ב-`normalize.drawnArea`: פינה קמורה חדה מאבדת לכל היותר
   * ‎r²(1−π/4) ≈ ‎0.054·min², כלומר סדר גודל מתחת ל-‎min²/2.
   */
  minSpurMm2: number;
  /** מעל הנתח הזה מהמתכת זה כבר לא ניקוי אלא עיצוב אחר — לא נוגעים. */
  maxShavedFraction: number;
}

export interface ShaveResult {
  design: NormalizedDesign;
  /** הקוצים שהוסרו, במ"מ. ליומן — זו הדרך היחידה לבחון את הכלל לאורך זמן. */
  spurs: Array<{ x: number; y: number; widthMm: number; heightMm: number; areaMm2: number }>;
}

/** כמה מותר לניקוי להזיז את המתאר לפני הפתיחה. אותו ערך כמו ב-V4 וב-thickenBridges. */
const CLEAN_MM = 0.02;

/**
 * תקציב קודקודים לפתיחה. אותה תקרה כמו ב-V4 וב-`thickenBridges`, ומאותה סיבה:
 * שתי פעולות ההיסט מתייקרות מהר יותר מלינארית בקודקודים.
 */
const MAX_VERTICES = 10_000;

/**
 * איזה חלק מהרצפה חתיכה צריכה להיות דקה ממנו **בכל נקודה** כדי להיחשב קוץ.
 *
 * חצי, וזה מה שמפריד קוץ מחוד: החתיכה נגזרת מהפתיחה, ולכן במקום שבו היא נפגשת
 * עם הגוף היא רחבה כרצפה — אלא אם היא שערה, שאין בה בכלל מקום כזה.
 */
const SPUR_THICKNESS_OF_FLOOR = 0.5;

const boxOf = (poly: Polygon) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
};

/**
 * מסיר בליטות מתכת דקות מהרצפה.
 *
 * מחזיר את העיצוב כמו שהוא כשאין מה להסיר, כדי ש-`frameCutouts` יזהה
 * "לא השתנה" ולא ירוץ שוב על ולידציה בלי סיבה — כמו שאר המנקים.
 *
 * **רץ אחרון בצינור, ולא סתם.** `thickenBridges` מרחיב צוואר **בדיוק** לרצפה,
 * ופתיחה בדיסק ברוחב הרצפה מוחקת פס ברוחב הזה עד לקו. כלומר כל גשר שעובה זה
 * עתה נראה לפתיחה כמו "מתכת דקה מדי" — ובלי השער למטה השלב הזה היה מגלח
 * בדיוק את מה שהשלב שלפניו הוסיף. השער הוא בדיקת קשירות פר-חתיכה: חתיכה
 * שהסרתה מפרקת את החומר לרכיבים אינה קוץ אלא גשר, והיא נשארת במקומה.
 */
export function shaveSpurs(n: NormalizedDesign, opts: ShaveOptions): ShaveResult {
  const { minMaterialMm, minSpurMm2, maxShavedFraction } = opts;
  if (!(minMaterialMm > 0)) return { design: n, spurs: [] };

  const strip: MultiPolygon = [rectPolygon(0, 0, n.lengthMm, n.widthMm)];
  const material = difference(strip, n.cutUnion);
  if (material.length === 0) return { design: n, spurs: [] };

  const simplified = simplify(material, CLEAN_MM);
  const vertices = simplified.reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0);
  // מעל התקציב פשוט לא נוגעים. זה אינו שקט מסוכן: הקוץ נשאר מה שהיה, והמסך
  // מציג אותו — בדיוק כמו לפני השלב הזה.
  if (vertices > MAX_VERTICES) return { design: n, spurs: [] };

  const opened = morphologicalOpen(simplified, minMaterialMm / 2);
  if (opened.length === 0) return { design: n, spurs: [] };

  const thin = minMaterialMm * SPUR_THICKNESS_OF_FLOOR;
  // מכאן והלאה כל הפרש הוא בין שני עותקים של אותו מתאר — `opened` יצא מהיסטים
  // על `simplified`, והקוצים שיוצאים ממנו נגזרים מ-`material`. זה בדיוק הקלט
  // שמפיל את polygon-clipping על `Unable to complete output ring`; ראה `safely`.
  const candidates = differenceSafe(simplified, opened)
    .filter((p) => polygonArea(p) >= minSpurMm2)
    // דקה לכל אורכה, ולא רק בקצה — ההבחנה בין שערה לחוד.
    .filter((p) => morphologicalOpen([p], thin / 2).length === 0);
  if (candidates.length === 0) return { design: n, spurs: [] };

  const totalArea = multiPolygonArea(material);
  if (!(totalArea > 0)) return { design: n, spurs: [] };

  // גשר ולא קוץ: חתיכה שהסרתה מוסיפה רכיב לחומר היא מה שמחזיק אותו יחד.
  // הבדיקה היא פר-חתיכה כדי שקוץ אמיתי לא ייפול בגלל גשר שיושב במקום אחר.
  const parts = material.length;
  const spurs: Polygon[] = [];
  for (const p of candidates) {
    if (differenceSafe(material, [p]).length === parts) spurs.push(p);
  }
  if (spurs.length === 0) return { design: n, spurs: [] };

  const shaved = multiPolygonArea(spurs);
  if (shaved / totalArea > maxShavedFraction) return { design: n, spurs: [] };

  const kept = differenceSafe(material, spurs);
  // גם ביחד, ולא רק אחת-אחת: שתי הסרות שכל אחת מהן בטוחה יכולות להיפגש בצוואר
  // שרק שתיהן יחד מנתקות.
  if (kept.length !== parts) return { design: n, spurs: [] };

  return {
    design: rebuildDesign(n, differenceSafe(strip, kept)),
    spurs: spurs.map((p) => {
      const b = boxOf(p);
      return {
        x: Math.round(((b.x0 + b.x1) / 2) * 100) / 100,
        y: Math.round(((b.y0 + b.y1) / 2) * 100) / 100,
        widthMm: Math.round((b.x1 - b.x0) * 100) / 100,
        heightMm: Math.round((b.y1 - b.y0) * 100) / 100,
        areaMm2: Math.round(polygonArea(p) * 1000) / 1000,
      };
    }),
  };
}
