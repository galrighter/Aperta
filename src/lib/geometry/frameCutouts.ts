import { FAB, resolveFab } from "@/lib/fabrication.config";
import { rescaleCutoutsSvg, svgFrame } from "./frame";
import { dropThinCutouts } from "./normalize";
import { restoreBridges, type BridgeRecord, type LetterBridge } from "./restoreBridges";
import { shaveSpurs, type ShaveResult } from "./shaveSpurs";
import { thickenBridges } from "./thickenBridges";
import { validateDesign, validateNormalized, type DesignDims } from "./validate";
import type { ValidationReport } from "./types";
import type { Box } from "@/lib/text/stencil";

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
 * הסטייה זעירה (AP-0064: 12.01 / 12.10 / 11.92 מול 12 שהוזמנו).
 *
 * מה שהיה שבור הוא **מה שקורה כשזה לא עובד**: הקוד נצמד לגבול הטווח. וכיוון
 * שהמודל כמעט אף פעם לא מצייר את היחס שהוזמן, זה מה שקרה כמעט תמיד — נמדד על
 * שמונה עיצובים רצופים, כולם נחתו על ±5% **בדיוק**:
 *
 *     AP-0060  29 → 30.45   AP-0065  40 → 38.00
 *     AP-0063  24 → 22.80   AP-0067  18 → 17.10
 *
 * וב-AP-0062 אותה הזמנה נתנה 10.5 בגרסה אחת ו-9.5 באחרת — **10% הפרש בין שתי
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
 * 10% נבחר מול מדידה: האי ב-AP-0060 היה 1.95% מהחומר — סדר גודל מתחת.
 */
const MAX_DROPPED_MATERIAL = 0.1;

/**
 * מעל אורך הגשר הזה עדיף למחוק אי מאשר לגשר אותו (החלטת גל).
 *
 * גשר קצר בתוך עיטור נראה כמו חלק ממנו; גשר ארוך הוא פס מתכת שחוצה את העיצוב,
 * והוא מזיק יותר מחלל חסר — שאיש ממילא לא מחפש, כי הלקוחה לא ראתה מה המודל
 * נתן. חלל של אות אינו מושפע מהסף: שם הגשר מוחזר למקומו ולא נמתח לשום מקום.
 */
const MAX_BRIDGE_SPAN_MM = 2;

/**
 * מעל כמה מהמתכת עיבוי גשרים מפסיק להיות תיקון. הוא אמור לגעת בצווארים בודדים
 * ולהוסיף שברירי מ"מ² — ב-AP-0068 זה 0.03% מהמתכת. סף של 2% הוא שתי סדרי גודל
 * מעל, ולכן חצייתו אומרת שהזיהוי טעה ולא שיש הרבה מה לתקן.
 */
const MAX_THICKENED_MATERIAL = 0.02;

/**
 * מתחת לשטח הזה, בליטת מתכת שהפתיחה הסירה היא העיגול של הפתיחה עצמה.
 *
 * אותה נוסחה שמגנה על פינה קמורה ב-`uncuttableParts` (`drawnArea`), על הרצפה
 * של המתכת: ‎0.75²/2. נמדד על AP-0200 חלופה 4 — הקוץ ‎0.39 ממ"ר, החתיכה הבאה
 * אחריו ‎0.07, והסף ‎0.28 נופל ביניהן.
 */
const MIN_SPUR_MM2 = (FAB.minLetterBridgeMm * FAB.minLetterBridgeMm) / 2;

/**
 * מעל כמה מהמתכת גילוח קוצים מפסיק להיות ניקוי. הוא אמור להסיר פרנז' של המעקב
 * — ב-AP-0200 זה ‎0.13% מהמתכת — ולכן 1% הוא כמעט סדר גודל מעל. חצייתו אומרת
 * שהזיהוי טעה, ואז עדיף להשאיר את מה שהמודל צייר.
 */
const MAX_SHAVED_MATERIAL = 0.01;

/** מה שהמסך צריך ממועמד — בלי גרף הפוליגונים. זה מה שעובר על החוט. */
export interface FramedPreview {
  /** ה-SVG אחרי מתיחה למסגרת שהוזמנה. */
  framedSvg: string;
  /** מה שנעשה לכל אי מתכת — גושר, חובר, או נמחק. ליומן. */
  bridges: BridgeRecord[];
  /**
   * הקוצים שגולחו מהמתאר. ליומן — ראה shaveSpurs.ts.
   *
   * רשות, ולא כי המסגור עשוי לא למלא אותו: שירות המסגור רץ גם על הקופסה וגם
   * ב-Worker נפרד, ותשובה משם עוברת `as FramedPreview` בלי אימות. עד
   * ששלושתם נפרסו מחדש השדה פשוט אינו קיים בתשובה, וטיפוס שמבטיח מערך היה
   * מבטיח משהו שאינו שם.
   */
  spurs?: ShaveResult["spurs"];
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
/**
 * מה שהמסגור צריך לדעת כדי לגשר איים במקום למחוק אותם.
 *
 * `letterBridges` הוא מה שנחתך בכיתוב (`LetteringRow.bridges`), בקואורדינטות
 * הפס שהוזמן — אותן קואורדינטות שהמסגור עובד בהן אחרי המתיחה, ולכן ההשוואה
 * ישירה. בלעדיו כל אי מטופל כאי בעיטור, וזו התנהגות נכונה להרצה בלי כיתוב.
 */
export interface BridgePlan {
  letterBridges?: readonly LetterBridge[];
}

/**
 * העברת תוכנית הגשרים אל המרחב שאחרי המסגור.
 *
 * ההערה מעל `BridgePlan` מבטיחה ש"אלה אותן קואורדינטות שהמסגור עובד בהן". זה
 * נכון לציר האורך — הוא נמתח תמיד אל האורך שהוזמן — ולא נכון לציר הרוחב: כשהיחס
 * שהמודל צייר נופל בתוך `WIDTH_TOLERANCE`, המסגרת מקבלת את הרוחב האחיד ולא את
 * המוזמן, עד 5% הפרש. התוכנית נמדדה על הפס שהוזמן, ולכן היא מפגרת אחריו.
 *
 * למה זה משנה: `matchLetter` מזהה חלל של אות לפי מרחק בין מרכזים, בסובלנות של
 * חצי מילימטר. 5% על פס של 18 מ"מ מזיזים מרכז עד ~0.45 מ"מ — עדיין בתוך
 * הסובלנות, אבל היא בוחרת את **הקרוב ביותר**, ובשדה שבו שני חללים סמוכים די
 * בכך כדי להצמיד אי לגשר של האות השכנה. אז נחתך גשר בכיוון הלא נכון, ועל `ם`
 * זו אות אחרת.
 *
 * שתי ההעברות שונות בכוונה:
 * - **תיבת החלל** נמתחת, מרכז וגובה כאחד — היא מתארת גאומטריה שנמתחה.
 * - **מלבן הגשר** רק זז, וגובהו נשמר. הגובה הזה הוא מידת ייצור במילימטרים,
 *   וכיווץ שלו ב-5% היה מדלל גשר אל מתחת ל-`minLetterBridgeMm` בשקט — הענף של
 *   גשרי האות ב-`restoreBridges` מצייר את המלבנים כמו שהם ואינו בודק רצפה.
 */
function planInFrame(plan: BridgePlan, k: number): BridgePlan {
  if (!plan.letterBridges?.length || Math.abs(k - 1) < 1e-9) return plan;
  const stretch = ([x0, y0, x1, y1]: Box): Box => [x0, y0 * k, x1, y1 * k];
  const shift = ([x0, y0, x1, y1]: Box): Box => {
    const half = (y1 - y0) / 2;
    const cy = ((y0 + y1) / 2) * k;
    return [x0, cy - half, x1, cy + half];
  };
  return {
    letterBridges: plan.letterBridges.map((b) => ({
      ...b,
      counter: stretch(b.counter),
      rects: b.rects.map(shift),
    })),
  };
}

export function frameCutoutsDims(
  dims: DesignDims,
  cutoutsSvg: string,
  orderedPlan: BridgePlan = {},
): FramedCutouts {
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
  // התוכנית נמדדה על הרוחב שהוזמן; המסגור עשוי למסור אחר. ראה `planInFrame`.
  const plan = planInFrame(orderedPlan, widthMm / orderedWidth);
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
  // "מוכן" — לא בין שני עיצובים. מטפלים בו כאן, לפני שמישהו רואה את התוצאה,
  // מאותה סיבה שמסירים פתחים שאי אפשר לחתוך.
  //
  // **מגשרים, ולא מוחקים** — ראה restoreBridges. מחיקה נשארה רק למה שאי אפשר
  // לגשר, כי היא זו שהפכה חלל של אות לכתם.
  let bridges: BridgeRecord[] = [];
  let spurs: ShaveResult["spurs"] = [];
  if (normalized) {
    const fab = resolveFab(framedDims.thicknessMm, framedDims.productType);
    const restored = restoreBridges(normalized, {
      letterBridges: plan.letterBridges,
      ornamentBridgeMm: fab.minBridgeCut,
      minBridgeMm: FAB.minLetterBridgeMm,
      maxSpanMm: MAX_BRIDGE_SPAN_MM,
      maxDroppedFraction: MAX_DROPPED_MATERIAL,
    });
    bridges = restored.records;
    if (restored.design !== normalized) {
      normalized = restored.design;
      framedSvg = restored.design.canonicalSvg;
      report = validateNormalized(restored.design, framedDims);
    }

    // ואחרי הגישור — הגשרים שהמודל צייר בעצמו. הם לא ניתקו כלום ולכן
    // `restoreBridges` לא רואה אותם, אבל צוואר של 0.37 מ"מ הוא מה שיישבר
    // בחיתוך. רץ שני כדי שמה ששוחזר, שכבר יושב על הרצפה, לא ייספר שוב.
    const thickened = thickenBridges(normalized, {
      minBridgeMm: FAB.minLetterBridgeMm,
      maxAddedFraction: MAX_THICKENED_MATERIAL,
    });
    if (thickened.design !== normalized) {
      normalized = thickened.design;
      framedSvg = thickened.design.canonicalSvg;
      report = validateNormalized(thickened.design, framedDims);
      bridges = [...bridges, ...thickened.records];
    }

    // ואחרון — הכיוון ההפוך של השניים שמעליו: מתכת דקה מהרצפה שאינה מחזיקה
    // דבר, כלומר קוץ. שלושת המנקים שלפניו מדלגים עליה בכוונה, כל אחד מסיבה
    // אחרת; הפירוט ב-shaveSpurs.ts. רץ אחרי העיבוי כדי שגשר שעובה זה עתה
    // לרצפה לא ייראה לפתיחה כמתכת דקה — ראה שער הקשירות שם.
    const shaved = shaveSpurs(normalized, {
      minMaterialMm: FAB.minLetterBridgeMm,
      minSpurMm2: MIN_SPUR_MM2,
      maxShavedFraction: MAX_SHAVED_MATERIAL,
    });
    if (shaved.design !== normalized) {
      normalized = shaved.design;
      framedSvg = shaved.design.canonicalSvg;
      report = validateNormalized(shaved.design, framedDims);
      spurs = shaved.spurs;
    }
  }

  return {
    framedSvg,
    bridges,
    spurs,
    lengthMm,
    widthMm,
    drawnRatio: drawn.widthMm > 0 ? drawn.lengthMm / drawn.widthMm : 0,
    // פי כמה נמתחה הדוגמה אופקית **מעבר** למה שהאנכי קיבל — כלומר היחס בין שני
    // המקדמים שהמסגור באמת הפעיל. 1 = קנה מידה אחיד, בלי עיוות.
    //
    // עד 15.8 המכנה היה `widthMm / orderedWidth`, כלומר הרוחב שנמסר מול הרוחב
    // ש**הוזמן**. במסלול הרגיל אלה אותם מספרים: ה-vectorizer מקבל את הרוחב
    // שהוזמן כ-`height_mm` ומחזיר אותו ב-viewBox, ולכן `drawn.widthMm ===
    // orderedWidth` תמיד ושתי הנוסחאות זהות. במסלול Story לא: שם המסגור מקבל
    // בכוונה רוחב מוזמן ששווה לרוחב האחיד (`storyFrameDims`), והנוסחה הישנה
    // החזירה את מקדם ההגדלה עצמו במקום 1 — AP-0170 דיווח "מתיחה ×1.57" על
    // מסגור אחיד לגמרי. זה לא רק שדה ביומן: `|stretch − 1|` הוא מפתח הדירוג
    // בין המועמדים, ולכן במסלול Story הוא דירג לפי כמה קצר המודל צייר.
    stretch: drawn.widthMm > 0 ? correction / (widthMm / drawn.widthMm) : correction,
    report,
    normalized,
  };
}

/** אותו חישוב, בלי גרף הפוליגונים — מה שמוחזר דרך גבול תהליך. */
export function framePreview(dims: DesignDims, cutoutsSvg: string, plan: BridgePlan = {}): FramedPreview {
  const { framedSvg, bridges, spurs, lengthMm, widthMm, drawnRatio, stretch, report } =
    frameCutoutsDims(dims, cutoutsSvg, plan);
  return { framedSvg, bridges, spurs, lengthMm, widthMm, drawnRatio, stretch, report };
}
