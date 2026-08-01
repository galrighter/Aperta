import { resolveFab } from "@/lib/fabrication.config";
import { rescaleCutoutsSvg, svgFrame } from "./frame";
import { dropDetachedMaterial, dropThinCutouts } from "./normalize";
import { validateDesign, validateNormalized, type DesignDims } from "./validate";
import type { ValidationReport } from "./types";

// מסגור מועמד: מתיחה למידה שהוזמנה + ולידציה, בלי DB ובלי רשת.
//
// למה זה יושב לבד ולא בתוך vectorizer.ts: זה הקוד שרץ גם ב-Worker נפרד
// (workers/frame). vectorizer.ts מושך את לקוח ה-DB, ו-Worker שנועד רק לחשב
// גיאומטריה לא צריך את זה — ולא צריך את הסודות שנלווים אליו.
//
// מה שחשוב לא פחות: זה מודול אחד. ה-Worker הנפרד מייבא בדיוק את הקוד הזה, לא
// עותק שלו. חוקי הייצור נשארים במקום אחד.

/**
 * כמה מותר לרוחב לסטות מהרוחב שהוזמן כדי לבלוע עיוות. החלטת גל, 26.7.
 *
 * הרעיון: אם קנה מידה **אחיד** מגיע לאורך שהוזמן ומשאיר את הרוחב בטווח הזה,
 * לוקחים אותו — אין שום עיוות בדוגמה, והרוחב זז במעט. זה עובד, וכשזה עובד
 * הסטייה זעירה (RM-0064: 12.01 / 12.10 / 11.92 מול 12 שהוזמנו).
 *
 * מה שהיה שבור הוא **מה שקורה כשזה לא עובד**: הקוד נצמד לגבול הטווח. וכיוון
 * שהמודל כמעט אף פעם לא מצייר את היחס שהוזמן, זה מה שקרה כמעט תמיד — נמדד על
 * שמונה עיצובים רצופים, כולם נחתו על ±5% **בדיוק**:
 *
 *     RM-0060  29 → 30.45   RM-0065  40 → 38.00
 *     RM-0063  24 → 22.80   RM-0067  18 → 17.10
 *
 * וב-RM-0062 אותה הזמנה נתנה 10.5 בגרסה אחת ו-9.5 באחרת — **10% הפרש בין שתי
 * גרסאות של אותו עיצוב.** הרוחב הוא מידה שהלקוחה בחרה, עם תצוגה מקדימה על
 * צילום של פרק יד, והוא זז מתחתיה בלי שנאמר לה דבר.
 *
 * הצמידה לגבול היא הגרוע משני העולמות: לא קנה מידה אחיד, וגם לא המידה שהוזמנה.
 * מחוץ לטווח, הטווח כבר לא מציל מעיוות — ולכן הרוחב הוא **בדיוק מה שהוזמן**,
 * וכל הפער נכנס למתיחה האופקית ומדווח ב-`stretch`.
 */
const WIDTH_TOLERANCE = 0.05;

/**
 * מעל כמה מהחומר מפסיקים להסיר אי בשקט. מעל הסף זה כבר לא תיקון אלא עיצוב
 * אחר, ועדיף להחזיר כשל בוולידציה מאשר להחזיר בשקט משהו שהמודל לא ייצר.
 * 10% נבחר מול מדידה: האי ב-RM-0060 היה 1.95% מהחומר — סדר גודל מתחת.
 */
const MAX_DROPPED_MATERIAL = 0.1;

/** מה שהמסך צריך ממועמד — בלי גרף הפוליגונים. זה מה שעובר על החוט. */
export interface FramedPreview {
  /** ה-SVG אחרי מתיחה למסגרת שהוזמנה. */
  framedSvg: string;
  lengthMm: number;
  widthMm: number;
  /** היחס שהמודל צייר בפועל, לפני המתיחה. */
  drawnRatio: number;
  /** פי כמה נמתחה הדוגמה אופקית מעבר למה שהרוחב בלע. 1 = בלי עיוות. */
  stretch: number;
  report: ValidationReport;
}

export interface FramedCutouts extends FramedPreview {
  normalized: ReturnType<typeof validateDesign>["normalized"];
}

/**
 * מותח cutouts גולמיים למסגרת שהוזמנה ומריץ ולידציה — בלי לשמור כלום.
 * משמש גם להערכת מועמדים לפני שבוחרים אחד מהם.
 */
export function frameCutoutsDims(dims: DesignDims, cutoutsSvg: string): FramedCutouts {
  const { lengthMm } = dims;
  const orderedWidth = dims.widthMm;

  // המסגרת שהמודל צייר בפועל, כפי שה-vectorizer מסר אותה.
  const drawn = svgFrame(cutoutsSvg) ?? { lengthMm, widthMm: orderedWidth };
  // הגורם שמחזיר את הדוגמה לאורך שהוזמן. 1 = המודל פגע ביחס המבוקש.
  const correction = drawn.lengthMm > 0 ? lengthMm / drawn.lengthMm : 1;
  // קנה מידה אחיד: מה שהרוחב היה מקבל אילו הדוגמה כולה הוגדלה אל האורך.
  const uniformWidth = drawn.widthMm * correction;
  const withinTolerance =
    uniformWidth >= orderedWidth * (1 - WIDTH_TOLERANCE) &&
    uniformWidth <= orderedWidth * (1 + WIDTH_TOLERANCE);
  const widthMm = withinTolerance
    ? Math.round(uniformWidth * 100) / 100
    : orderedWidth;
  const framedDims: DesignDims = {
    productType: dims.productType,
    lengthMm,
    widthMm,
    thicknessMm: dims.thicknessMm,
  };
  let framedSvg = rescaleCutoutsSvg(cutoutsSvg, { lengthMm, widthMm });
  let { report, normalized } = validateDesign(framedSvg, framedDims);

  // הווקטורייזר כבר מסנן פתחים שאי אפשר לחתוך, אבל לא כל SVG מגיע משם: גרסאות
  // שנשמרו לפני הסינון עדיין נושאות שערות, וכל עריכה שלהן עוברת כאן. מפעילים
  // את אותו כלל על מה שנכנס לגרסה, כך שעיצוב ישן מתנקה כשהוא עובר במסלול —
  // ומה שמוצג ללקוחה הוא בדיוק מה שיישמר.
  if (normalized) {
    const cleaned = dropThinCutouts(normalized, resolveFab(framedDims.thicknessMm, framedDims.productType).minHole);
    if (cleaned !== normalized) {
      normalized = cleaned;
      framedSvg = cleaned.canonicalSvg;
      report = validateNormalized(cleaned, framedDims);
    }
  }

  // אי חומר (V2/V3) הוא הכשל הנפוץ שנשאר, והוא הפרש בין "לא ניתן לייצור" לבין
  // "מוכן" — לא בין שני עיצובים. מסירים אותו כאן, לפני שמישהו רואה את התוצאה,
  // מאותה סיבה שמסירים פתחים שאי אפשר לחתוך: הלקוחה לא ראתה גרסה אחרת ולכן
  // אין ממה לגרוע, אבל היא כן הייתה נתקעת עם עיצוב שאי אפשר להזמין.
  if (normalized) {
    const joined = dropDetachedMaterial(normalized, MAX_DROPPED_MATERIAL);
    if (joined !== normalized) {
      normalized = joined;
      framedSvg = joined.canonicalSvg;
      report = validateNormalized(joined, framedDims);
    }
  }

  return {
    framedSvg,
    lengthMm,
    widthMm,
    drawnRatio: drawn.widthMm > 0 ? drawn.lengthMm / drawn.widthMm : 0,
    stretch: correction / (widthMm / orderedWidth),
    report,
    normalized,
  };
}

/** אותו חישוב, בלי גרף הפוליגונים — מה שמוחזר דרך גבול תהליך. */
export function framePreview(dims: DesignDims, cutoutsSvg: string): FramedPreview {
  const { framedSvg, lengthMm, widthMm, drawnRatio, stretch, report } = frameCutoutsDims(dims, cutoutsSvg);
  return { framedSvg, lengthMm, widthMm, drawnRatio, stretch, report };
}
