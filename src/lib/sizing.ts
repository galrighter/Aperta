// מודל המידות — התרגום בין מה שהלקוח יודע (מידת טבעת / היקף פרק יד) לבין מה
// שהמכונה צריכה (אורך פריסה לחיתוך). מקור: docs/sizing-fit-review.md §2.
//
// כל החישוב יושב על אורך קשת **הציר הניטרלי**:
//
//     D_n     = ID_eff + 2·K·t
//     gapArc  = D_n · asin(gapChord / D_n)
//     L_blank = π·D_n − gapArc
//
// זו הכללה של הנוסחה במחקר, L = (ID + t)·π, שנכונה רק ל-K = 0.5. לפליז
// fabrication-research.md §2.4 נותן K = 0.40–0.45 תלוי ב-r/t, ו-resolveFab
// מחזיר את הערך לפי העובי. ההפרש שווה 0.29 מידות טבעת — משמעותי בטבעות,
// זניח בצמידים.
//
// אין להטמיע את הנוסחאות האלה בשום מקום אחר בקוד.

import { FAB, resolveFab, type FitStyle, type ProductType } from "./fabrication.config";

/** ID לפי מידה אמריקאית (מ"מ), התקן המקובל. */
export const US_RING_ID_MM: Record<string, number> = {
  "4": 14.86, "4.5": 15.27, "5": 15.70, "5.5": 16.10, "6": 16.51, "6.5": 16.92,
  "7": 17.35, "7.5": 17.75, "8": 18.19, "8.5": 18.53, "9": 18.95, "9.5": 19.41,
  "10": 19.84, "10.5": 20.24, "11": 20.68, "11.5": 21.08, "12": 21.49,
  "12.5": 21.89, "13": 22.33,
};

export const US_RING_SIZES = Object.keys(US_RING_ID_MM)
  .map(Number)
  .sort((a, b) => a - b);

/** מ"מ של ID למידה אמריקאית אחת — 0.83 מ"מ. שווה לזכור בכל דיון על סבולת. */
export const MM_ID_PER_US_SIZE =
  (US_RING_ID_MM["13"] - US_RING_ID_MM["4"]) / (13 - 4);

export interface SizingInput {
  product: ProductType;
  thicknessMm: number;
  widthMm: number;
  /** פער בין הקצוות כ**מיתר** (chord) — ראו FAB.gapIsChord */
  gapChordMm: number;
  /** טבעת: ID נומינלי במ"מ (המידה שהלקוח מדד/בחר) */
  idMm?: number;
  /** צמיד: היקף פרק היד במ"מ */
  wristMm?: number;
  /** צמיד: רמת החופש */
  fit?: FitStyle;
}

export interface SizingResult {
  /** אורך הפריסה לחיתוך — מה שנכנס ל-design.length_mm */
  blankLengthMm: number;
  /** ה-ID שהלקוח ביקש (בצמיד: נגזר מהיקף + Fit) */
  nominalIdMm: number;
  /** ה-ID בפועל אחרי תוספת הרוחב */
  effectiveIdMm: number;
  /** ההיקף הפנימי בפועל */
  innerCircumferenceMm: number;
  /** תוספת הנוחות שנגזרה מהרוחב */
  widthAllowanceMm: number;
  /** תוספת ה-Fit (צמידים בלבד) */
  fitEaseMm: number;
  /** אורך הקשת שהפער תופס על הציר הניטרלי */
  gapArcMm: number;
  kFactor: number;
}

/** המרת פער-מיתר לפער-קשת על מעגל בקוטר D_n. */
export function gapChordToArc(gapChordMm: number, neutralDiameterMm: number): number {
  if (gapChordMm <= 0) return 0;
  const ratio = Math.min(1, gapChordMm / neutralDiameterMm);
  return neutralDiameterMm * Math.asin(ratio);
}

/** מידה → אורך פריסה. הכיוון הראשי. */
export function computeSizing(input: SizingInput): SizingResult {
  const { product, thicknessMm, widthMm, gapChordMm } = input;
  const k = resolveFab(thicknessMm, product).kFactor;
  const widthAllowanceMm = FAB.widthComfortAllowanceMm(widthMm);

  let nominalIdMm: number;
  let fitEaseMm = 0;
  if (product === "ring") {
    if (input.idMm === undefined) throw new Error("ring sizing requires idMm");
    nominalIdMm = input.idMm;
  } else {
    if (input.wristMm === undefined) throw new Error("bracelet sizing requires wristMm");
    fitEaseMm = FAB.fitEaseMm[input.fit ?? "comfort"];
    nominalIdMm = (input.wristMm + fitEaseMm) / Math.PI;
  }

  // תוספת הרוחב היא תוספת ל**היקף** הפנימי, ולכן ל-ID היא נכנסת חלקי π
  const effectiveIdMm = nominalIdMm + widthAllowanceMm / Math.PI;
  const neutralDiameterMm = effectiveIdMm + 2 * k * thicknessMm;
  const gapArcMm = gapChordToArc(gapChordMm, neutralDiameterMm);

  return {
    blankLengthMm: Math.PI * neutralDiameterMm - gapArcMm,
    nominalIdMm,
    effectiveIdMm,
    innerCircumferenceMm: Math.PI * effectiveIdMm,
    widthAllowanceMm,
    fitEaseMm,
    gapArcMm,
    kFactor: k,
  };
}

export interface DerivedSize {
  nominalIdMm: number;
  innerCircumferenceMm: number;
  /** טבעת: המידה האמריקאית הקרובה ביותר (מעוגל לחצי מידה) */
  usRingSize?: number;
  /** צמיד: היקף פרק היד שהתכשיט מתאים לו ברמת ה-Fit הנתונה */
  wristMm?: number;
}

/** אורך פריסה → מידה. הכיוון ההפוך, לתצוגת "המידה שתתקבל". */
export function sizeFromBlank(
  blankLengthMm: number,
  input: Omit<SizingInput, "idMm" | "wristMm">,
): DerivedSize {
  const { product, thicknessMm, widthMm, gapChordMm } = input;
  const k = resolveFab(thicknessMm, product).kFactor;
  const widthAllowanceMm = FAB.widthComfortAllowanceMm(widthMm);

  // D_n מופיע בשני האגפים (גם בקשת הפער) — פתרון בנקודת שבת, מתכנס תוך ~5 סבבים
  let neutralDiameterMm = (blankLengthMm + gapChordMm) / Math.PI;
  for (let i = 0; i < 40; i++) {
    const gapArc = gapChordToArc(gapChordMm, neutralDiameterMm);
    neutralDiameterMm = (blankLengthMm + gapArc) / Math.PI;
  }

  const effectiveIdMm = neutralDiameterMm - 2 * k * thicknessMm;
  const nominalIdMm = effectiveIdMm - widthAllowanceMm / Math.PI;
  const out: DerivedSize = {
    nominalIdMm,
    innerCircumferenceMm: Math.PI * effectiveIdMm,
  };

  if (product === "ring") {
    out.usRingSize = nearestUsRingSize(nominalIdMm);
  } else {
    const ease = FAB.fitEaseMm[input.fit ?? "comfort"];
    out.wristMm = Math.PI * nominalIdMm - ease;
  }
  return out;
}

/** המידה האמריקאית הקרובה ל-ID נתון, מעוגלת לחצי מידה ומוגבלת לטווח הטבלה. */
export function nearestUsRingSize(idMm: number): number {
  const lo = US_RING_SIZES[0];
  const hi = US_RING_SIZES[US_RING_SIZES.length - 1];
  const raw = lo + (idMm - US_RING_ID_MM[String(lo)]) / MM_ID_PER_US_SIZE;
  return Math.min(hi, Math.max(lo, Math.round(raw * 2) / 2));
}

/**
 * רדיוס הציר הניטרלי של הקשת המוגמרת, מתוך אורך הפריסה והפער-מיתר.
 * הפער סוגר את המעגל: 2π·R_n = L + gapArc(R_n), ו-gapArc תלוי ב-R_n עצמו.
 *
 * משמש את ההדמיה התלת-ממדית. שים לב: הרדיוס הפנימי הוא **R_n − K·t** ולא
 * R_n − t/2 — הציר הניטרלי יושב במרחק K·t מהפנים, והוא במרכז העובי רק כש-K=0.5.
 * בפליז K≈0.42–0.45, כלומר הנחת t/2 מקטינה את ה-ID ב-t·(1−2K) ≈ 0.18 מ"מ.
 */
export function neutralRadiusFromBlank(blankLengthMm: number, gapChordMm: number): number {
  let r = (blankLengthMm + gapChordMm) / (2 * Math.PI);
  for (let i = 0; i < 40; i++) {
    r = (blankLengthMm + gapChordToArc(gapChordMm, 2 * r)) / (2 * Math.PI);
  }
  return r;
}
