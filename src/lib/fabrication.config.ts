// מקור כל הערכים: docs/fabrication-research.md
// ערכי המידות וההתאמה (products.*, fitEaseMm, widthComfortAllowanceMm, gapIsChord):
// docs/sizing-fit-review.md §3 — דלתא שאושרה ע"י גל.
// חומר: פליז C260 מוחזר (annealed O60). חיתוך: לייזר סיבים + חנקן.
// אין לפזר מספרי ייצור בקוד — הכול עובר דרך resolveFab() ו-lib/sizing.ts.

export type ProductType = "bracelet" | "ring";

/** רמת ה"חופש" של צמיד על פרק היד. רלוונטי לצמידים בלבד — בטבעת הפער והמידה
 *  קובעים, ואין לנו מנגנון כוונון (ראו sizing-fit-review §4.4). */
export type FitStyle = "snug" | "comfort" | "loose";

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
  // הכרעת טמפר (sizing-fit-review §4.4): annealed בלבד. ההפרש בכוח הכוונון הידני
  // מול quarter-hard הוא פי 2.7 — צמיד quarter-hard 1.5 מ"מ דורש 6–8 ק"ג כוח
  // ולכן אינו מתכוונן בפועל. גם מטריצת ה-Springback (§4.3) נגזרת מהטמפר הזה.
  material: "C260 brass, annealed (O60)",
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

  // מקדם K תלוי ב-r/t, לא רק בעובי. עמודת byThickness.kFactor היא הטור של
  // r/t גבוה (קשת צמיד, ~17–23) — בדיוק הטרנד שב-fabrication-research.md §2.4.
  // בטבעת r/t יורד ל-3–5 והציר הניטרלי נדחף פנימה, ולכן K נמוך יותר. הפרש של
  // 0.02 בעובי 1.5 מ"מ שווה 0.19 מ"מ בפריסה = 0.23 מידות טבעת — בדיוק על סף
  // הרעש של המערכת (sizing-fit-review §4.4), ולכן לא ניתן להזניח אותו.
  ringKFactorOffset: -0.02,
  kFactorClamp: [0.35, 0.45] as [number, number],

  maxOpenAreaWarnPct: 25,   // מעל זה — warn (ערך שמרני מהמחקר)
  maxOpenAreaFailPct: 30,   // מעל זה — fail (תקרה קשיחה לערגול)
  minFeatureFactor: 1.0,    // פרט עצמאי מינימלי = 1.0×עובי
  minInnerCornerAngleDeg: 30,
  outerCornerRadiusMm: 2.0,       // עיגול פינות המלבן החיצוני
  edgeBreakRadiusMm: 0.2,         // תיעוד לייצור (שבירת קצה), לא נאכף בתוכנה
  brassDensityGcm3: 8.53,         // לחישוב משקל משוער

  applyKerfCompensation: false,   // המכונה מפצה. ערכי הקרף שמורים לעתיד.
  applyBendAllowance: false,      // TODO שלב עתידי: BA = θ(r + K·t). ערכי K שמורים.

  // ⚠ `gap_mm` הוא **מיתר** (chord) — המרחק בקו ישר בין קצות התכשיט, מה שקליבר
  // מודד ומה שהלקוח רואה. ההמרה לקשת נעשית ב-lib/sizing.ts ולא בשום מקום אחר.
  gapIsChord: true,

  // תוספות ה-Fit להיקף הפנימי של צמיד (sizing-fit-review §4.1). ערכים נמוכים
  // מאלה שבמחקר המקורי: המספרים שלו הם של צמיד שרשרת שנשמט, ו-Cuff קשיח לא נשמט.
  fitEaseMm: { snug: 8, comfort: 15, loose: 22 } as Record<FitStyle, number>,

  /** תוספת נוחות להיקף הפנימי לפי רוחב הפס (sizing-fit-review §2.5).
   *  מנגנון אחד ומונוטוני במקום "0.5 מ"מ אוטומטי + עלה חצי מידה" של המחקר,
   *  ששניהם יחד הם ספירה כפולה. מוצג למשתמש, לא מוחל בשקט. */
  widthComfortAllowanceMm: (widthMm: number): number =>
    widthMm <= 4 ? 0 : widthMm <= 6 ? 0.5 : widthMm <= 9 ? 1.25 : 2.5,

  /**
   * `lengthHintMm` הוא **תצוגה בלבד** — הטווח שמוצג ליד שדה האורך בסטודיו.
   * הוא היה `lengthRangeMm` ונאכף כחיתוך, וזו הייתה טעות: אורך הפריסה נגזר
   * מהמידה שהלקוחה מדדה, ומידה היא מדידה ולא הצעה. החיתוך היה **שקט** —
   * RM-0065 (נמדד) הוזמן להיקף 11 ס"מ, החישוב נתן 104.4 מ"מ, ונשמר 125.0.
   * הלקוחה קיבלה תכשיט לפרק יד של 13 ס"מ בלי שום חיווי, וכל היקף מתחת ל-130
   * מ"מ נחתך לאותו פס בדיוק.
   *
   * התחתית 125 מעולם לא הייתה גבול ייצור. היא הייתה תחתית הטבלה בביקורת §2.4,
   * שמכסה פרקי יד 14–21 ס"מ — כלומר מבוגרים. הכיפוף עצמו רחוק מאוד מהגבול
   * (r/t יורד מ-19.8 ל-13.9 בפריט של ילד, מול מינימום 0.5).
   *
   * מה שכן משתנה בקצה הקטן — פער קבוע שתופס 21% מהמעגל במקום 14%, ורוחב פס
   * שאינו מוגבל ביחס להיקף — מטופל במקומו ולא בחסימת האורך. ראו §6.
   */
  products: {
    // טווחי הרוחב מיושרים ל-handoff של מסע היצירה (צמיד 5–80, טבעת 4–18),
    // כדי שהסטודיו והאתר יציעו את אותו טווח. אלה גבולות ממשק בלבד —
    // הוולידציה עצמה נגזרת מ-resolveFab() ולא מהטווחים כאן.
    bracelet: {
      // 160 מ"מ ≈ פרק יד 16.7 ס"מ ב-comfort, פס צר. פס רחב מוסיף את תוספת הרוחב.
      defaultLengthMm: 160, lengthHintMm: [125, 215] as [number, number],
      defaultWidthMm: 18,  widthRangeMm: [5, 80] as [number, number],
      defaultGapMm: 25.4,  gapRangeMm: [22, 32] as [number, number],
    },
    ring: {
      // 55.5 מ"מ = US 7 (ID 17.35) בפער 3 מ"מ. זהו **אורך פריסה**, לא היקף אצבע.
      defaultLengthMm: 55.5, lengthHintMm: [46, 72] as [number, number],
      defaultWidthMm: 6,   widthRangeMm: [4, 18] as [number, number],
      defaultGapMm: 3,     gapRangeMm: [2, 5] as [number, number],
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
    kFactor: clamp(
      product === "ring" ? c.kFactor + FAB.ringKFactorOffset : c.kFactor,
      FAB.kFactorClamp[0],
      FAB.kFactorClamp[1],
    ),
    minFeature: FAB.minFeatureFactor * thicknessMm,
    maxOpenAreaWarnPct: FAB.maxOpenAreaWarnPct,
    maxOpenAreaFailPct: FAB.maxOpenAreaFailPct,
    minInnerCornerAngleDeg: FAB.minInnerCornerAngleDeg,
    outerCornerRadiusMm: FAB.outerCornerRadiusMm,
  };
}
