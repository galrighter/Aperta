// המספר הסידורי של עיצוב, בייצוג שאומרים בקול.
//
// זהו הרפרנס האנושי לעיצוב — בפידבק מחברים ("תסתכל על AP-0007") ובהזמנה.
// ה-uuid נשאר המזהה הטכני; הוא לא ניתן להקראה בטלפון ולכן אינו רפרנס.
// חסר תלויות בכוונה: גם השרת וגם הדפדפן משתמשים בו.

// הקידומת עברה מ-`RM` ל-`AP` במיתוג מחדש ל-Aperta (docs/brand/README.md).
// הספרות לא זזו: מה שהוצג `RM-0077` מוצג היום `AP-0077`, ואותו עיצוב מאחוריו.
export const DESIGN_CODE_PREFIX = "AP";

/** `0007` — הספרות בלבד, בלי הקידומת. null כשאין סידורי. */
export function designSerialDigits(serial: number | null | undefined): string | null {
  if (typeof serial !== "number" || !Number.isFinite(serial) || serial < 1) return null;
  return String(Math.floor(serial)).padStart(4, "0");
}

/** `AP-0007`. null כשאין סידורי — עיצוב שנוצר לפני המיגרציה, או שלא נשמר עדיין. */
export function designCode(serial: number | null | undefined): string | null {
  const digits = designSerialDigits(serial);
  return digits && `${DESIGN_CODE_PREFIX}-${digits}`;
}

/** מה שצריך כדי לדעת אם עיצוב הוא דוגמה של עיצוב אחר, ואיזו (0018). */
export interface DesignSampleFields {
  serial: number | null | undefined;
  root_serial?: number | null;
  sample_no?: number | null;
}

/** `0085.2` — כמו `designSerialDigits`, אבל עם מספר הדוגמה כשיש. בלי קידומת,
 *  לשימוש בשמות קובץ (`lib/export/fileName.ts`). */
export function designSampleDigits(design: DesignSampleFields): string | null {
  if (design.root_serial == null || design.sample_no == null) return designSerialDigits(design.serial);
  const digits = designSerialDigits(design.root_serial);
  return digits && `${digits}.${design.sample_no}`;
}

/**
 * `AP-0085.2` — הדוגמה השנייה שנוצרה משכפול של עיצוב 0085. `root_serial` ו-
 * `sample_no` מתמלאים רק בשכפול (`/api/designs/[id]/duplicate`); עיצוב שאינו
 * דוגמה של שום דבר מקבל את `designCode` הרגיל, על ה-`serial` של עצמו.
 */
export function designSampleCode(design: DesignSampleFields): string | null {
  const digits = designSampleDigits(design);
  return digits && `${DESIGN_CODE_PREFIX}-${digits}`;
}
