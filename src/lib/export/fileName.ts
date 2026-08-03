// שם קובץ הייצור שיורד למחשב — סעיף 10.
//
// `0075-120-12.svg`: הסידורי של העיצוב, ואחריו המידות הכלליות במ"מ (אורך על
// רוחב). זה מה שאומרים על הפריט בקול — "שבעים וחמש, מאה ועשרים על שתים עשרה"
// — ולכן זה מה שצריך להופיע בתיקיית ההורדות ליד עוד עשרים קבצים. השם הקודם
// (`name_bracelet_v3`) חזר על העיצוב בשם חופשי שהלקוחה בחרה, ולא אמר כלום על
// המידה — מה שנחתך בפועל.
//
// חסר תלויות בכוונה, כמו designCode: נקרא מהשרת ובר־בדיקה בלי מסד.

import { designSerialDigits } from "@/lib/designCode";

/** מ"מ בשם קובץ: `120`, `104.4`. עיגול לעשירית — מתחת לזה זה רעש ייצור. */
function mm(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 10) / 10);
}

/**
 * `0075-120-12` — הבסיס לשם הקובץ, בלי הסיומת.
 *
 * בלי סידורי (עיצוב מלפני מיגרציה 0008) נשארות המידות בלבד: אין לנו רפרנס
 * אנושי להציג, ו-uuid בשם הקובץ לא עוזר לאף אחד בבית המלאכה.
 */
export function exportFileBase(
  serial: number | null | undefined,
  lengthMm: number,
  widthMm: number,
): string {
  const dims = `${mm(lengthMm)}-${mm(widthMm)}`;
  const digits = designSerialDigits(serial);
  return digits ? `${digits}-${dims}` : dims;
}
