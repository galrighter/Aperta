import { getDesign, getVersion } from "@/lib/db/designs";
import type { OrderRow } from "@/lib/db/orders";
import { designSampleCode } from "@/lib/designCode";
import { FAB, type ProductType } from "@/lib/fabrication.config";
import { productionMetrics } from "@/lib/sizing";
import type { ValidationReport } from "@/lib/geometry/types";

/**
 * מה שצריך כדי לאשר בייצור את מה שהוזמן, ואישור ויזואלי שזה אכן העיצוב
 * שהלקוחה בחרה — בלי לגעת בעמוד העיצוב עצמו (docs/TODO.md, פנייתו של גל
 * 5.8.26: הקישור ל-`/design?resume=` מצפה שהאדמין יהיה בעל החשבון של
 * הלקוחה, וזה לא המקרה עבור אף הזמנה אמיתית).
 *
 * הגרסה שנלקחת היא **הגרסה שהוזמנה** (`order.version_id`), לא הנוכחית של
 * העיצוב — אותו עיקרון כמו בייצוא (`lib/export/build.ts`).
 */
export interface OrderProductionInfo {
  code: string | null;
  name: string;
  productType: ProductType;
  /** ה-SVG של הגרסה שהוזמנה, לתצוגה ויזואלית — לא לחיתוך. */
  svg: string | null;
  versionNo: number | null;
  /** הגרסה שהוזמנה אינה הנוכחית — אפשר להמשיך לערוך עיצוב אחרי ההזמנה. */
  isCurrentVersion: boolean;
  lengthMm: number;
  widthMm: number;
  gapMm: number;
  /** אורך קשת הפער על הציר הניטרלי — מה שבפועל נחתך לאורך ההיקף, לעומת
   *  `gapMm` שהוא הפער-מיתר שקליבר מודד. */
  gapArcMm: number;
  /** ה-ID הנומינלי, לבדיקה מול הפריט שנחתך. */
  nominalIdMm: number;
  thicknessMm: number;
  material: string;
  /** משקל משוער בגרמים, מדוח הוולידציה של הגרסה — null כשאין דוח (גרסה
   *  ישנה, או שהוולידציה לא רצה). */
  estWeightGrams: number | null;
  /**
   * המידות הגיעו מצילום ההזמנה (0022) ולא מהעיצוב החי. `false` בהזמנות
   * שקדמו למיגרציה — ואז מה שמוצג הוא **העיצוב כפי שהוא היום**, שיכול היה
   * להשתנות מאז. ההבדל הזה חייב להיאמר על המסך ולא להישאר בקוד.
   */
  dimsFromOrder: boolean;
  /** צילום קיים, אבל העיצוב החי כבר שונה ממנו — עריכה אחרי ההזמנה. */
  designChangedSince: boolean;
}

export async function orderedDesignInfo(order: OrderRow): Promise<OrderProductionInfo | null> {
  if (!order.design_id) return null;
  const design = await getDesign(order.design_id);
  const versionId = order.version_id ?? design.current_version_id;
  const version = versionId ? await getVersion(versionId).catch(() => null) : null;

  // **המידות של ההזמנה, לא של העיצוב.** הצילום (0022) נכתב ברגע ההזמנה;
  // העיצוב עצמו ניתן לעריכה אחריה — ובמסלול Story המידה בכלל נשאלת אחרי
  // שיש עיצוב. מה שנחתך חייב להיות מה שהלקוחה אישרה, וההערה מעל הפונקציה
  // הבטיחה זאת מזמן בלי שהקוד יקיים.
  const dimsFromOrder = order.length_mm != null && order.thickness_mm != null;
  const lengthMm = dimsFromOrder ? Number(order.length_mm) : Number(design.length_mm);
  const widthMm = order.width_mm != null ? Number(order.width_mm) : Number(design.width_mm);
  const gapMm = order.gap_mm != null ? Number(order.gap_mm) : Number(design.gap_mm);
  const thicknessMm = dimsFromOrder ? Number(order.thickness_mm) : Number(design.thickness_mm);
  const metrics = productionMetrics({
    product: design.product_type,
    thicknessMm,
    widthMm,
    gapMm,
    lengthMm,
  });

  const report = (version?.validation_report ?? null) as ValidationReport | null;

  return {
    code: designSampleCode(design),
    name: design.name,
    productType: design.product_type,
    svg: version?.svg ?? null,
    versionNo: version?.version_no ?? null,
    isCurrentVersion: version != null && version.id === design.current_version_id,
    lengthMm,
    widthMm,
    gapMm,
    gapArcMm: metrics.gapArcMm,
    nominalIdMm: metrics.nominalIdMm,
    thicknessMm,
    material: FAB.material,
    estWeightGrams: report?.metrics?.estWeightGrams ?? null,
    dimsFromOrder,
    // חצי מ"מ הוא רעש עיגול; מה שמעליו הוא עריכה. משווים את שלוש המידות
    // שנחתכות בפועל, לא את הרוחב בלבד.
    designChangedSince:
      dimsFromOrder &&
      (Math.abs(lengthMm - Number(design.length_mm)) > 0.5 ||
        Math.abs(gapMm - Number(design.gap_mm)) > 0.5 ||
        Math.abs(thicknessMm - Number(design.thickness_mm)) > 0.01),
  };
}
