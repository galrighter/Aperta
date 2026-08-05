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
}

export async function orderedDesignInfo(order: OrderRow): Promise<OrderProductionInfo | null> {
  if (!order.design_id) return null;
  const design = await getDesign(order.design_id);
  const versionId = order.version_id ?? design.current_version_id;
  const version = versionId ? await getVersion(versionId).catch(() => null) : null;

  const lengthMm = Number(design.length_mm);
  const widthMm = Number(design.width_mm);
  const gapMm = Number(design.gap_mm);
  const thicknessMm = Number(design.thickness_mm);
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
  };
}
