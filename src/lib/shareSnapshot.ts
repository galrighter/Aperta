import { svgFrame } from "@/lib/geometry/frame";
import { validateDesign } from "@/lib/geometry/validate";
import { difference, rectPolygon } from "@/lib/geometry/poly";
import { FAB } from "@/lib/fabrication.config";
import { renderPathOf, type DesignRow, type VersionRow } from "@/lib/db/designs";
import type { NewShare } from "@/lib/db/shares";

/**
 * בניית צילום המצב שנשמר בשיתוף.
 *
 * המסגרת נקראת מה-viewBox של הגרסה ולא משורת העיצוב, מאותה סיבה שמסך התוצאה
 * קורא אותה משם (ראו `lib/geometry/frame`): שורת העיצוב שומרת את מה שהוזמן,
 * וה-SVG שומר את המסגרת שהגרסה באמת יושבת בה. השתיים עשויות להיבדל ברוחב, וזו
 * שנחתכת בפועל היא השנייה.
 */
export function buildShareSnapshot(design: DesignRow, version: VersionRow): NewShare {
  const frame = svgFrame(version.svg);
  const lengthMm = frame?.lengthMm ?? Number(design.length_mm);
  const widthMm = frame?.widthMm ?? Number(design.width_mm);
  const thicknessMm = Number(design.thickness_mm) || FAB.defaultThicknessMm;

  // הפוליגונים של המתכת, פעם אחת. כשל כאן אינו מונע שיתוף — הדף נופל לתצוגה
  // השטוחה, בדיוק כמו גרסה שחזרה בלי גאומטריה במסע היצירה.
  let material: NewShare["material"] = null;
  try {
    const { normalized } = validateDesign(version.svg, {
      productType: design.product_type,
      lengthMm,
      widthMm,
      thicknessMm,
    });
    if (normalized) {
      material = difference([rectPolygon(0, 0, lengthMm, widthMm)], normalized.cutUnion);
    }
  } catch {
    /* נשארים בלי גאומטריה */
  }

  return {
    design_id: design.id,
    version_id: version.id,
    product_type: design.product_type,
    length_mm: lengthMm,
    width_mm: widthMm,
    gap_mm: Number(design.gap_mm),
    thickness_mm: thicknessMm,
    svg: version.svg,
    material,
    render_path: renderPathOf(version),
    serial: design.serial ?? null,
  };
}
