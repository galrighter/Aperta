// המספר הסידורי של עיצוב, בייצוג שאומרים בקול.
//
// זהו הרפרנס האנושי לעיצוב — בפידבק מחברים ("תסתכל על RM-0007") ובהזמנה.
// ה-uuid נשאר המזהה הטכני; הוא לא ניתן להקראה בטלפון ולכן אינו רפרנס.
// חסר תלויות בכוונה: גם השרת וגם הדפדפן משתמשים בו.

export const DESIGN_CODE_PREFIX = "RM";

/** `RM-0007`. null כשאין סידורי — עיצוב שנוצר לפני המיגרציה, או שלא נשמר עדיין. */
export function designCode(serial: number | null | undefined): string | null {
  if (typeof serial !== "number" || !Number.isFinite(serial) || serial < 1) return null;
  return `${DESIGN_CODE_PREFIX}-${String(Math.floor(serial)).padStart(4, "0")}`;
}
