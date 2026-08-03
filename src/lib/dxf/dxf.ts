import type { MultiPolygon, Ring } from "@/lib/geometry/types";

// כתיבת DXF ASCII ישירות (סעיף 10). פורמט AC1009 (R12) עם ישויות POLYLINE
// קלאסיות — הערה: המפרט מציין LWPOLYLINE, אך LWPOLYLINE אינה קיימת ב-R12;
// POLYLINE/VERTEX/SEQEND היא הצורה התקנית ב-R12 ונפתחת בכל תוכנת CAD.
// הייצוא עוקב אחרי גבול המתכת האמיתי: הטבעת החיצונית של כל פוליגון = הפרופיל
// (כולל קצה גלי אם חיתוך מגיע לקצה); טבעות פנימיות = חורים. ללא פיצוי kerf.

interface DxfVertex {
  x: number;
  y: number;
  bulge?: number;
}

const F = (v: number) => v.toFixed(4);

function polylineEntity(layer: string, vertices: DxfVertex[]): string {
  const lines: string[] = [
    "0", "POLYLINE",
    "8", layer,
    "66", "1",
    // נקודת הדמה. R12 דורש 10/20/30 על ה-POLYLINE עצמו, לפני flag 70, והיא
    // מתעלמת בקריאה — הקואורדינטות האמיתיות יושבות על ה-VERTEX-ים. בלעדיה
    // הקובץ נפתח ברוב הכלים אבל AutoCAD AUDIT ו-CAM קפדני של מפעלי לייזר
    // דוחים או מפילים ישויות, וזה בדיוק השלב הידני שהצינור אמור לבטל.
    "10", "0.0", "20", "0.0", "30", "0.0",
    "70", "1", // closed
  ];
  for (const v of vertices) {
    lines.push("0", "VERTEX", "8", layer, "10", F(v.x), "20", F(v.y), "30", "0.0");
    if (v.bulge) lines.push("42", F(v.bulge));
  }
  lines.push("0", "SEQEND", "8", layer);
  return lines.join("\n");
}

export interface DxfInput {
  lengthMm: number;
  widthMm: number;
  /** גבול המתכת האמיתי = difference(רצועה, איחוד החיתוכים). טבעת חיצונית=פרופיל,
   *  טבעות פנימיות=חורים. תומך בקצה גלי כשחיתוך חוצה את הקצה. */
  material: MultiPolygon;
}

/**
 * DXF מלא ביחידות מ"מ. ציר ה-Y הפוך מ-SVG (DXF הוא y-למעלה) כדי שהקובץ
 * ייראה ב-CAD כמו בסטודיו.
 */
export function buildDxf(input: DxfInput): string {
  const { lengthMm: L, widthMm: W, material } = input;
  const flipRing = (ring: Ring): DxfVertex[] => ring.map(([x, y]) => ({ x, y: W - y }));

  const entities: string[] = [];
  for (const poly of material) {
    poly.forEach((ring, ri) => {
      if (ring.length < 3) return;
      // ri===0 טבעת חיצונית = פרופיל הצמיד; שאר = חורים פנימיים
      entities.push(polylineEntity(ri === 0 ? "OUTLINE" : "CUTOUTS", flipRing(ring)));
    });
  }

  return [
    // HEADER
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    "9", "$INSBASE", "10", "0.0", "20", "0.0", "30", "0.0",
    "9", "$EXTMIN", "10", "0.0", "20", "0.0",
    "9", "$EXTMAX", "10", F(L), "20", F(W),
    "0", "ENDSEC",
    // TABLES — סוגי קו ואז שכבות
    "0", "SECTION", "2", "TABLES",
    // טבלת ה-LTYPE. שתי השכבות מפנות ל-CONTINUOUS, ובלי שהוא מוגדר כאן זו
    // הפניה לרשומה שלא קיימת: קורא סלחני ממציא אותה, קורא קפדני נופל על
    // הקובץ. 65 (empty) ו-73/40 (אפס קטעים, אורך 0) הם הקו הרציף עצמו.
    "0", "TABLE", "2", "LTYPE", "70", "1",
    "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0",
    "0", "ENDTAB",
    "0", "TABLE", "2", "LAYER", "70", "2",
    "0", "LAYER", "2", "OUTLINE", "70", "0", "62", "1", "6", "CONTINUOUS",
    "0", "LAYER", "2", "CUTOUTS", "70", "0", "62", "5", "6", "CONTINUOUS",
    "0", "ENDTAB",
    "0", "ENDSEC",
    // ENTITIES
    "0", "SECTION", "2", "ENTITIES",
    entities.join("\n"),
    "0", "ENDSEC",
    "0", "EOF",
  ].join("\n") + "\n";
}

/** SVG ייצוא לצפייה: כל קווי החיתוך (פרופיל + חורים) כקווים אדומים דקים —
 *  תצוגה מדויקת של מסלולי הלייזר, כולל קצה גלי. */
export function buildExportSvg(input: DxfInput): string {
  const { lengthMm: L, widthMm: W, material } = input;
  const ringPath = (ring: Ring): string =>
    ring.length ? "M" + ring.map(([x, y]) => `${F(x)} ${F(y)}`).join(" L") + " Z" : "";
  const paths = material
    .flatMap((poly) => poly)
    .filter((ring) => ring.length >= 3)
    .map((ring) => `<path d="${ringPath(ring)}" fill="none" stroke="red" stroke-width="0.1"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${L + 2} ${W + 2}">${paths}</svg>`
  );
}
