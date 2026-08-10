import { he } from "@/i18n/he";
import { FAB, NECK_FLOOR_MM, resolveFab, type ProductType } from "@/lib/fabrication.config";
import { normalizeSvg, ContractViolation, isCuttableOpening, type NormalizedDesign } from "./normalize";
import {
  difference, morphologicalOpen, simplify,
  multiPolygonArea, polygonArea, ringCentroid, ringBBoxRadius, rectPolygon,
} from "./poly";
import type {
  CheckResult, CheckStatus, ValidationReport, MultiPolygon, ValidationLocation,
} from "./types";

// מנוע הוולידציה — סעיף 7 במפרט. רץ בצד שרת על ה-SVG המנורמל.
// בדיקות שלא בשלב 1 (TODO): עיוות ערגול, חוזק, פיצוי התארכות.

export interface DesignDims {
  productType: ProductType;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

export interface ValidationOutcome {
  report: ValidationReport;
  normalized: NormalizedDesign | null;
}

/** כמה מותר לניקוי להזיז את המתאר לפני מדידת הצווארים. סדר גודל מתחת לרצפה. */
const NECK_CLEAN_MM = 0.02;

/**
 * מעל כמה קודקודים מוותרים על מדידת הצווארים.
 *
 * אותה תקרה כמו ב-`thickenBridges`, ומאותה סיבה: שתי פעולות ההיסט מתייקרות
 * מהר יותר מלינארית בקודקודים, והוולידציה רצה פר-מועמד. עיצוב אמיתי נמדד
 * ב-720–787 קודקודים — פי סדר גודל מתחת לתקרה.
 */
const NECK_MAX_VERTICES = 10_000;

function centroidLocations(mp: MultiPolygon): ValidationLocation[] {
  return mp.map((poly) => {
    const [x, y] = ringCentroid(poly[0]);
    return { x, y, r: ringBBoxRadius(poly[0]) };
  });
}

function aggregate(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

function emptyMetrics(dims: DesignDims) {
  return {
    stripAreaMm2: dims.lengthMm * dims.widthMm,
    cutAreaMm2: 0,
    openAreaPct: 0,
    estWeightGrams: 0,
  };
}

/** ולידציה מלאה של SVG גולמי. V1 (חוזה) קודם — אם נכשל, שאר הבדיקות לא רצות. */
export function validateDesign(rawSvg: string, dims: DesignDims): ValidationOutcome {
  let normalized: NormalizedDesign;
  try {
    normalized = normalizeSvg(rawSvg, dims.lengthMm, dims.widthMm);
  } catch (e) {
    const message = e instanceof ContractViolation ? e.message : `SVG parsing failed: ${e instanceof Error ? e.message : e}`;
    return {
      normalized: null,
      report: {
        status: "fail",
        checks: [{
          check: "V1",
          status: "fail",
          message: he.checks.V1,
          details: message,
          locations: [],
        }],
        metrics: emptyMetrics(dims),
      },
    };
  }
  const report = validateNormalized(normalized, dims);
  return { normalized, report };
}

export function validateNormalized(n: NormalizedDesign, dims: DesignDims): ValidationReport {
  const fab = resolveFab(dims.thicknessMm, dims.productType);
  const L = dims.lengthMm, W = dims.widthMm;
  const strip: MultiPolygon = [rectPolygon(0, 0, L, W)];
  const cutUnion = n.cutUnion;
  const material = difference(strip, cutUnion);

  const checks: CheckResult[] = [];
  checks.push({ check: "V1", status: "pass", message: he.checks.V1, details: "SVG contract OK", locations: [] });

  // V2 — חומר רציף
  {
    const comps = material;
    if (comps.length !== 1) {
      const sorted = [...comps].sort((a, b) => polygonArea(b) - polygonArea(a));
      const islands = sorted.slice(1);
      checks.push({
        check: "V2", status: "fail", message: he.checks.V2,
        details: `Material splits into ${comps.length} disconnected components. ` +
          `Island centers (mm): ${islands.map((p) => { const c = ringCentroid(p[0]); return `(${c[0].toFixed(1)}, ${c[1].toFixed(1)})`; }).join(", ")}. ` +
          `Every part of the remaining material must be connected — add bridges.`,
        locations: centroidLocations(islands),
      });
    } else {
      checks.push({ check: "V2", status: "pass", message: he.checks.V2, details: "Material is a single connected body", locations: [] });
    }
  }

  // V3 — איי חומר בתוך cutout (טבעות פנימיות באיחוד החיתוכים)
  {
    const holeLocs: ValidationLocation[] = [];
    for (const poly of cutUnion) {
      for (let i = 1; i < poly.length; i++) {
        const [x, y] = ringCentroid(poly[i]);
        holeLocs.push({ x, y, r: ringBBoxRadius(poly[i]) });
      }
    }
    if (holeLocs.length > 0) {
      checks.push({
        check: "V3", status: "fail", message: he.checks.V3,
        details: `Found ${holeLocs.length} material island(s) fully surrounded by cutouts at (mm): ` +
          `${holeLocs.map((l) => `(${l.x.toFixed(1)}, ${l.y.toFixed(1)})`).join(", ")}. ` +
          `These islands will fall out when cut. Connect them to the body with bridges or remove them.`,
        locations: holeLocs,
      });
    } else {
      checks.push({ check: "V3", status: "pass", message: he.checks.V3, details: "No trapped material islands", locations: [] });
    }
  }

  // V4 — רוחב גשר מינימלי מוחלט.
  //
  // V2 תופס אי ש**נותק**; זה תופס אי שמחובר בחוט. טופולוגית הם שונים, פיזית הם
  // אותו פגם: צוואר של 0.2 מ"מ נחתך ונשבר בגלגול או בדרך לסדנה, ועד כאן הוא
  // עבר את כל הוולידציה.
  //
  // **הרצפה היא `minLetterBridgeMm` ולא `minBridgeCut`.** זו אינה החזרה של V4
  // ההיסטורי (2.25 מ"מ, מודע-כיוון) שהוסר במדיניות המתירנית — ראה
  // docs/REMOVED_CONSTRAINTS.md. גשר של אות יושב במכוון בין 0.75 ל-1.5, ולפסול
  // אותו פירושו לפסול כל פריט עם כיתוב. מה שנפסל כאן הוא רק מה שהקוד עצמו כבר
  // מכריז עליו כרצפה שלא יורדים מתחתיה.
  //
  // הבדיקה רצה **אחרי** `thickenBridges` (ראה frameCutouts), ולכן היא נדלקת
  // בדיוק כשהתיקון best-effort ויתר — מה שעד כה קרה בשקט מוחלט.
  //
  // **הרצפה הנאכפת היא `NECK_FLOOR_MM` ולא `minLetterBridgeMm`.** ההפרש בין
  // השתיים הוא הסובלנות ש-`thickenBridges` מוותר בתוכה במכוון, וכשהבדיקה הזו
  // התעלמה ממנה נוצר תחום מת: צוואר ב-[0.70, 0.75) נפסל כאן ולא תוקן שם, כי
  // המתקן ויתר עליו במכוון. עיצוב שנחת שם היה "לא ניתן לייצור" לתמיד. שני
  // הצדדים קוראים היום את אותו מספר, ולכן כל צוואר שנפסל כאן הוא צוואר שהמתקן
  // כבר ניסה להרחיב וכשל. ראה `letterBridgeToleranceMm`.
  {
    const floor = NECK_FLOOR_MM;
    // אותו ניקוי כמו ב-thickenBridges: מתאר שחוזר מהמעקב נושא נקודה כל
    // 0.02–0.1 מ"מ, וזה מה שמייקר את ההיסטים. התזוזה מתחת לרצפה שנמדדת.
    const simplified = simplify(material, NECK_CLEAN_MM);
    const vertices = simplified.reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0);
    if (vertices > NECK_MAX_VERTICES) {
      // לא לדלג בשקט. בדיקה שלא רצה אינה בדיקה שעברה, ומי שמסתכל על הכרטיס
      // צריך לדעת שדווקא הפריט המורכב הוא זה שלא נבדק.
      checks.push({
        check: "V4", status: "warn", message: he.checks.V4warn,
        details: `Bridge-width check skipped: ${vertices} vertices over the ${NECK_MAX_VERTICES} budget.`,
        locations: [],
      });
    } else {
      // פתיחה מורפולוגית בדיסק ברוחב הרצפה: כל צוואר שאינו מסוגל להכיל אותו
      // נקרע, והגוף מתפרק. טריז שמתחדד נעלם בקצהו ולא מפריד — ולכן ספירת
      // הרכיבים מודדת צווארים ולא קווים דקים.
      const opened = morphologicalOpen(simplified, floor / 2);
      const extra = opened.length - simplified.length;
      if (extra > 0) {
        const sorted = [...opened].sort((a, b) => polygonArea(b) - polygonArea(a));
        const hanging = sorted.slice(simplified.length);
        checks.push({
          check: "V4", status: "fail", message: he.checks.V4,
          details: `Material is held by ${extra} neck(s) thinner than the ${floor}mm enforced floor, at (mm): ` +
            `${hanging.map((p) => { const c = ringCentroid(p[0]); return `(${c[0].toFixed(1)}, ${c[1].toFixed(1)})`; }).join(", ")}. ` +
            `Automatic thickening (to ${FAB.minLetterBridgeMm}mm) already ran and could not fix these. ` +
            `A neck this thin survives validation but breaks when cut or rolled — widen it.`,
          locations: centroidLocations(hanging),
        });
      } else {
        checks.push({
          check: "V4", status: "pass", message: he.checks.V4,
          details: `No neck thinner than ${floor}mm`, locations: [],
        });
      }
    }
  }

  // V5 — גודל פתח מינימלי (erosion של כל cutout ברדיוס minHole/2). מדיניות גל:
  // minHole=0.5מ"מ בלבד. שאר המגבלות (גשר/חריץ/שוליים/שטח-פתוח/פינות/פרט) הוסרו —
  // ראו docs/REMOVED_CONSTRAINTS.md. סומכים על המודל; נחזיר אם ניתקל בבעיה.
  {
    const locs: ValidationLocation[] = [];
    for (const cut of n.cutouts) {
      for (const poly of cut) {
        // אותו predicate בדיוק שהמנקה מריץ (`isCuttableOpening`). שני מימושים
        // של אותה שאלה נבדלו כאן בסף — והתוצאה הייתה שהמנקה השאיר בשקט את מה
        // שהבדיקה הזו פוסלת.
        if (!isCuttableOpening(poly, fab.minHole)) {
          const [x, y] = ringCentroid(poly[0]);
          locs.push({ x, y, r: ringBBoxRadius(poly[0]) });
        }
      }
    }
    if (locs.length > 0) {
      checks.push({
        check: "V5", status: "fail", message: he.checks.V5,
        details: `${locs.length} cutout(s) smaller than the minimum opening ${fab.minHole}mm at (mm): ` +
          `${locs.map((l) => `(${l.x.toFixed(1)}, ${l.y.toFixed(1)})`).join(", ")}. Enlarge or remove them.`,
        locations: locs,
      });
    } else {
      checks.push({ check: "V5", status: "pass", message: he.checks.V5, details: `All cutouts ≥ ${fab.minHole}mm`, locations: [] });
    }
  }

  const stripArea = L * W;
  const cutArea = multiPolygonArea(cutUnion);
  const openPct = (cutArea / stripArea) * 100; // מוצג כמידע בלבד, לא נאכף
  const materialArea = multiPolygonArea(material);
  const estWeightGrams = (materialArea * dims.thicknessMm / 1000) * FAB.brassDensityGcm3;

  return {
    status: aggregate(checks),
    checks,
    metrics: {
      stripAreaMm2: stripArea,
      cutAreaMm2: cutArea,
      openAreaPct: openPct,
      estWeightGrams,
    },
  };
}
