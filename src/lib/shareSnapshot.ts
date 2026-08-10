import { svgFrame } from "@/lib/geometry/frame";
import { validateDesign } from "@/lib/geometry/validate";
import { difference, rectPolygon } from "@/lib/geometry/poly";
import { FAB } from "@/lib/fabrication.config";
import { renderPathOf, type DesignRow, type VersionRow } from "@/lib/db/designs";
import type { NewShare } from "@/lib/db/shares";
import type { LetterBridge } from "@/lib/geometry/restoreBridges";

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
    // תוכנית גשרי הכיתוב של הגרסה (0021). היא נשמרה בקואורדינטות המסגרת של
    // הגרסה — אותה מסגרת שנקראה למעלה מה-viewBox — ולכן היא צמודה ל-`svg`
    // שנשמר כאן ולא לשורת העיצוב. מי שיאמץ את השיתוף מעביר אותה למסגרת שלו.
    letter_bridges: letterBridgesOf(version),
    render_path: renderPathOf(version),
    serial: design.serial ?? null,
  };
}

/**
 * תוכנית הגשרים שנשמרה על הגרסה, אם יש.
 *
 * קריאה סלחנית במכוון: `validation_report` הוא jsonb חופשי, והשדה נוסף מאוחר —
 * כל הגרסאות שנוצרו לפניו יחזירו `null`, וזו התנהגות תקינה (אימוץ בלי תוכנית
 * הוא בדיוק מה שהיה עד כה). מה שאסור הוא שרשומה חלקית תפיל שיתוף שכבר תקין.
 */
function letterBridgesOf(version: VersionRow): LetterBridge[] | null {
  const raw = (version.validation_report as { letterBridges?: unknown } | null)?.letterBridges;
  if (!Array.isArray(raw)) return null;
  const usable = raw.filter(
    (b): b is LetterBridge =>
      Boolean(b) &&
      Array.isArray((b as LetterBridge).counter) &&
      Array.isArray((b as LetterBridge).rects) &&
      typeof (b as LetterBridge).widthMm === "number",
  );
  return usable.length ? usable : null;
}
