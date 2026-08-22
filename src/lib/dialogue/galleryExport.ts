import { previewOf } from "@/lib/designPreview";
import { previewFrame } from "@/components/create/savedPreview";
import type { CuratedDesign } from "./gallery";

// dialogue mode — טרנספורמציות הייצוא של הגלריה (‏PROMPT_SPEC §3.2), טהורות.
//
// הסקריפט (`scripts/export-gallery.ts`) הוא צנרת דקה סביב שתי הפונקציות כאן:
// מהקובץ המלא לתקציר המאוצר, ומ-SVG קנוני לקובץ תצוגה. מה שיכול להיות שגוי
// בשקט — קדימות `overrides`, קוטביות התצוגה, `null` על מה שלא נמדד — יושב
// כאן ונבדק, בלי DB ובלי מערכת קבצים.

/** רשומה גולמית מ-`gallery-tags.json` — מה שהסקריפט קורא. רופף בכוונה:
 *  קובץ נערך ביד, וקריאה שנשענת על צורה מדויקת נשברת על התיקון הראשון. */
export interface RawTagRecord {
  version_id?: unknown;
  serial?: unknown;
  product_type?: unknown;
  length_mm?: unknown;
  width_mm?: unknown;
  missing?: unknown;
  computed?: Record<string, unknown> | null;
  read?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : null;

/**
 * רשומת תקציר אחת מרשומה מלאה. `null` על רשומה שאינה ברת-גלריה: לא מאוצרת,
 * מסומנת `missing` (הגרסה נמחקה מה-DB — אין ציור להציג), או חסרת מזהה/מוצר.
 *
 * הקדימות היא של §3.2: `overrides` (תיקוני גל) גוברים על `read` (הקריאה),
 * וריצה חוזרת של התיוג לעולם לא נוגעת בהם. מספר שלא נמדד נכתב `null` —
 * לא אפס ולא ניחוש.
 */
export function curatedRecordOf(raw: RawTagRecord): CuratedDesign | null {
  if (raw.overrides?.gallery !== true || raw.missing === true) return null;
  const versionId = str(raw.version_id);
  const product = raw.product_type === "bracelet" || raw.product_type === "ring"
    ? raw.product_type
    : null;
  if (!versionId || !product) return null;

  const read = raw.read ?? {};
  const over = raw.overrides ?? {};
  const computed = raw.computed ?? {};

  const readOut: CuratedDesign["read"] = {};
  const READ_KEYS = [
    "outer_silhouette", "element_shapes", "rhythm", "ends_treatment", "region_map",
  ] as const;
  for (const key of READ_KEYS) {
    const value = str(over[key]) ?? str(read[key]);
    if (value) readOut[key] = value;
  }

  return {
    version_id: versionId,
    serial: num(raw.serial),
    product_type: product,
    tags: strList(over.character_tags) ?? strList(read.character_tags) ?? [],
    concept: str(over.concept) ?? str(read.concept),
    read: readOut,
    computed: {
      length_to_width_ratio: num(computed.length_to_width_ratio),
      openings_count: num(computed.openings_count),
      metal_void_balance: num(computed.metal_void_balance),
      mirror_symmetry: str(computed.mirror_symmetry),
    },
  };
}

/**
 * התקציר המאוצר כולו, בסדר קבוע (סידורי, ואז מזהה) — כדי ששתי ריצות ייצוא
 * על אותו קובץ יפיקו diff ריק.
 */
export function curatedRecordsOf(file: unknown): CuratedDesign[] {
  const designs = (file as { designs?: unknown })?.designs;
  if (!Array.isArray(designs)) return [];
  return designs
    .filter((r): r is RawTagRecord => Boolean(r) && typeof r === "object")
    .map(curatedRecordOf)
    .filter((r): r is CuratedDesign => r !== null)
    .sort((a, b) =>
      (a.serial ?? Infinity) - (b.serial ?? Infinity) || (a.version_id < b.version_id ? -1 : 1),
    );
}

/** מידות הנפילה-לאחור של רשומה — ‏`previewOf` קורא את המסגרת האמיתית
 *  מה-viewBox של ה-SVG; אלה רק למקרה שאין. */
export function dimsOf(raw: RawTagRecord): { lengthMm: number; widthMm: number } {
  return { lengthMm: num(raw.length_mm) ?? 0, widthMm: num(raw.width_mm) ?? 0 };
}

/**
 * קובץ התצוגה של עיצוב אחד — SVG עצמאי וקטן שהגלריה מציגה כ-`<img>`.
 *
 * **לא ה-SVG הקנוני.** הקנוני הוא קובץ ייצור: לבן הוא חומר, שחור הוא "הסר
 * את זה" — קוטביות שהעין קוראת הפוך (הלקח של `FlatCanvas`), והוא גם כבד
 * (עד 190KB לעיצוב עקיב). כאן נבנה מה שהכרטיסים בכל האתר כבר מציירים:
 * ה-path של החומר שנשאר (`previewOf` — מלבן פחות החיתוכים, מדולל), מלא
 * בגרפיט על רקע שקוף. עיצוב ממוצע יורד לקילובייטים בודדים, והחורים נקראים
 * כחורים.
 *
 * `null` על SVG ששובר את החוזה — הייצוא מדווח עליו בקול במקום לכתוב קובץ ריק.
 */
export function displaySvgOf(
  svg: string,
  dims: { lengthMm: number; widthMm: number },
): string | null {
  const preview = previewOf(svg, dims);
  if (!preview) return null;
  const frame = previewFrame(preview.path, preview.lengthMm, preview.widthMm);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.viewBox}" role="img">` +
    `<path d="${preview.path}" fill-rule="evenodd" fill="#202326"/>` +
    `</svg>`
  );
}
