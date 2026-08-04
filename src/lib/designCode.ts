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
