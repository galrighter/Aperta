// מקור כל הערכים: docs/fabrication-research.md
// חומר: פליז C260 מוחזר/רבע-קשה. חיתוך: לייזר סיבים + חנקן.
// אין לפזר מספרי ייצור בקוד — הכול עובר דרך resolveFab().
//
// ⚠ ביקורת פתוחה על ערכי המידות (products.*): docs/sizing-fit-review.md §3.
//   בין השאר: ring.defaultLengthMm=54 הוא היקף אצבע ולא אורך פריסה (יוצא US 6.4
//   במקום 7 → 55.5), ring.defaultGapMm=6 גדול פי 2 מהמומלץ (3), וטווחי הפער
//   רחבים מדי בשני המוצרים. לא שונו כאן — הכרעת מוצר של גל.

export type ProductType = "bracelet" | "ring";

interface ThicknessConstants {
  kerf: number;
  minHole: number;
  minSlot: number;
  minBridgeCut: number;
  minBridgeBendBracelet: number;
  minBridgeBendRing: number;
  edgeMargin: number;
  endMargin: number;
  minInnerRadius: number;
  kFactor: number;
}

export const FAB = {
  material: "C260 brass, annealed / quarter-hard",
  cutMethod: "fiber-laser",
  defaultThicknessMm: 1.5,
  supportedThicknessesMm: [1, 1.5, 2, 2.5, 3],

  // ערכים לפי עובי — ישירות מטבלת האב במחקר. מפתח = עובי במ"מ.
  byThickness: {
    1.0: { kerf: 0.10, minHole: 1.5, minSlot: 1.0, minBridgeCut: 1.0,
           minBridgeBendBracelet: 1.5,  minBridgeBendRing: 2.5,
           edgeMargin: 2.0, endMargin: 5.0, minInnerRadius: 0.5,  kFactor: 0.45 },
    1.5: { kerf: 0.12, minHole: 2.0, minSlot: 1.5, minBridgeCut: 1.5,
           minBridgeBendBracelet: 2.25, minBridgeBendRing: 3.75,
           edgeMargin: 3.0, endMargin: 5.0, minInnerRadius: 0.75, kFactor: 0.44 },
    2.0: { kerf: 0.15, minHole: 3.0, minSlot: 2.0, minBridgeCut: 2.0,
           minBridgeBendBracelet: 3.0,  minBridgeBendRing: 5.0,
           edgeMargin: 4.0, endMargin: 6.0, minInnerRadius: 1.0,  kFactor: 0.43 },
    2.5: { kerf: 0.18, minHole: 3.5, minSlot: 2.5, minBridgeCut: 2.5,
           minBridgeBendBracelet: 3.75, minBridgeBendRing: 6.25,
           edgeMargin: 5.0, endMargin: 7.5, minInnerRadius: 1.25, kFactor: 0.42 },
    3.0: { kerf: 0.20, minHole: 4.0, minSlot: 3.0, minBridgeCut: 3.0,
           minBridgeBendBracelet: 4.5,  minBridgeBendRing: 7.5,
           edgeMargin: 6.0, endMargin: 9.0, minInnerRadius: 1.5,  kFactor: 0.42 },
  } as Record<number, ThicknessConstants>,

  // חריגה מודעת מהמחקר: בטבעת צרה, שוליים של edgeMargin מלא משני הצדדים
  // לא משאירים שטח עיצוב. לטבעת בלבד: שוליים = max(1.0×עובי, 1.5 מ"מ),
  // בהתאם למינימום התעשייתי (סעיף 1.6 במחקר). מסומן כסטייה מאושרת ע"י גל.
  ringEdgeMarginOverride: (t: number) => Math.max(t, 1.5),

  maxOpenAreaWarnPct: 25,   // מעל זה — warn (ערך שמרני מהמחקר)
  maxOpenAreaFailPct: 30,   // מעל זה — fail (תקרה קשיחה לערגול)
  minFeatureFactor: 1.0,    // פרט עצמאי מינימלי = 1.0×עובי
  minInnerCornerAngleDeg: 30,
  outerCornerRadiusMm: 2.0,       // עיגול פינות המלבן החיצוני
  edgeBreakRadiusMm: 0.2,         // תיעוד לייצור (שבירת קצה), לא נאכף בתוכנה
  brassDensityGcm3: 8.53,         // לחישוב משקל משוער

  applyKerfCompensation: false,   // המכונה מפצה. ערכי הקרף שמורים לעתיד.
  applyBendAllowance: false,      // TODO שלב עתידי: BA = θ(r + K·t). ערכי K שמורים.

  products: {
    bracelet: {
      defaultLengthMm: 160, lengthRangeMm: [140, 200] as [number, number],
      defaultWidthMm: 15,  widthRangeMm: [10, 30] as [number, number],
      defaultGapMm: 25,    gapRangeMm: [15, 40] as [number, number],
    },
    ring: {
      defaultLengthMm: 54, lengthRangeMm: [44, 70] as [number, number],   // לפי היקף אצבע
      defaultWidthMm: 8,   widthRangeMm: [4, 12] as [number, number],
      defaultGapMm: 6,     gapRangeMm: [3, 12] as [number, number],
    },
  },

  MAX_REPAIR_ROUNDS: 3,
  DAILY_GENERATION_LIMIT: 50,
} as const;

/** סט המגבלות האפקטיבי לעובי ומוצר נתונים. כל הקוד (ולידציה, פרומפט, ייצוא)
 *  עובד אך ורק מול התוצאה של הפונקציה הזו. */
export interface ResolvedFab {
  thicknessMm: number;
  product: ProductType;
  kerf: number;
  minHole: number;
  minSlot: number;
  /** גשר מינימלי לחיתוך נקי — להודעות הסבר בלבד */
  minBridgeCut: number;
  /** הגשר האפקטיבי לוולידציה: שרידות בערגול לפי המוצר */
  minBridgeBend: number;
  /** שוליים לאורך השפות הארוכות (כולל ה-override לטבעת) */
  edgeMargin: number;
  /** אזור מלא ליד הקצוות הפתוחים */
  endMargin: number;
  minInnerRadius: number;
  kFactor: number;
  minFeature: number;
  maxOpenAreaWarnPct: number;
  maxOpenAreaFailPct: number;
  minInnerCornerAngleDeg: number;
  outerCornerRadiusMm: number;
}

export function resolveFab(thicknessMm: number, product: ProductType): ResolvedFab {
  const keys = Object.keys(FAB.byThickness).map(Number).sort((a, b) => a - b);
  const min = keys[0];
  const max = keys[keys.length - 1];
  if (thicknessMm < min || thicknessMm > max) {
    throw new Error(`Unsupported thickness ${thicknessMm}mm (supported ${min}-${max}mm)`);
  }

  let c: ThicknessConstants;
  if (FAB.byThickness[thicknessMm]) {
    c = FAB.byThickness[thicknessMm];
  } else {
    // אינטרפולציה ליניארית בין העוביים השכנים
    const lo = keys.filter((k) => k < thicknessMm).pop()!;
    const hi = keys.find((k) => k > thicknessMm)!;
    const t = (thicknessMm - lo) / (hi - lo);
    const a = FAB.byThickness[lo];
    const b = FAB.byThickness[hi];
    const lerp = (x: number, y: number) => x + (y - x) * t;
    c = {
      kerf: lerp(a.kerf, b.kerf),
      minHole: lerp(a.minHole, b.minHole),
      minSlot: lerp(a.minSlot, b.minSlot),
      minBridgeCut: lerp(a.minBridgeCut, b.minBridgeCut),
      minBridgeBendBracelet: lerp(a.minBridgeBendBracelet, b.minBridgeBendBracelet),
      minBridgeBendRing: lerp(a.minBridgeBendRing, b.minBridgeBendRing),
      edgeMargin: lerp(a.edgeMargin, b.edgeMargin),
      endMargin: lerp(a.endMargin, b.endMargin),
      minInnerRadius: lerp(a.minInnerRadius, b.minInnerRadius),
      kFactor: lerp(a.kFactor, b.kFactor),
    };
  }

  // מדיניות שוליים מינימליים: פס הקצה לאורך X בטוח בכיפוף (דק ב-Y, ארוך ב-X),
  // אז אין צורך ברצועה רחבה שחונקת את העיצוב לרוחב האמצע. משאירים רק פס דק
  // כדי שהקצה לא יהיה שערה ושמלבן הייצוא יישאר תקין (חיתוכים לא נוגעים בגבול).
  // חוזק/דקות אמיתיים נאכפים ע"י V10 (פרט מינימלי) ו-V4 (גשר).
  const edgeMarginRaw = product === "ring" ? FAB.ringEdgeMarginOverride(thicknessMm) : c.edgeMargin;

  return {
    thicknessMm,
    product,
    kerf: c.kerf,
    // מדיניות גל: פתח מינימלי 0.5מ"מ (הלייזר יורד נמוך). שאר המגבלות הוסרו.
    minHole: 0.5,
    minSlot: c.minSlot,
    minBridgeCut: c.minBridgeCut,
    minBridgeBend: product === "ring" ? c.minBridgeBendRing : c.minBridgeBendBracelet,
    edgeMargin: Math.min(edgeMarginRaw, 1.0),
    endMargin: Math.min(c.endMargin, 2.0),
    minInnerRadius: c.minInnerRadius,
    kFactor: c.kFactor,
    minFeature: FAB.minFeatureFactor * thicknessMm,
    maxOpenAreaWarnPct: FAB.maxOpenAreaWarnPct,
    maxOpenAreaFailPct: FAB.maxOpenAreaFailPct,
    minInnerCornerAngleDeg: FAB.minInnerCornerAngleDeg,
    outerCornerRadiusMm: FAB.outerCornerRadiusMm,
  };
}
