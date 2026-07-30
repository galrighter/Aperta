import { resolveFab } from "@/lib/fabrication.config";
import { rescaleCutoutsSvg, svgFrame } from "./frame";
import { dropThinCutouts } from "./normalize";
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

/** כמה מותר לרוחב לסטות מהרוחב שהוזמן כדי לבלוע עיוות. החלטת גל, 26.7. */
const WIDTH_TOLERANCE = 0.05;

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
  const widthMm =
    Math.round(
      Math.min(
        Math.max(drawn.widthMm * correction, orderedWidth * (1 - WIDTH_TOLERANCE)),
        orderedWidth * (1 + WIDTH_TOLERANCE),
      ) * 100,
    ) / 100;
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
