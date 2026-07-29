import { he } from "@/i18n/he";
import type { OrderRow } from "./db/orders";

// סיכום ההזמנה בשורות — מקום אחד.
//
// עד עכשיו הדפדפן בנה את השורות, שלח אותן כטקסט, והשרת העביר את אותה מחרוזת
// הלאה. זה עבד, אבל פירושו שמה שנשמר בהזמנה הוא ניסוח ולא נתונים: להוסיף שדה
// לסיכום היה שינוי בדפדפן בלבד, ולקרוא ממנו מחיר או מידה היה regex.
//
// כאן זה הפוך: השורה במסד היא המקור, והשורות נגזרות ממנה. לכן ההתראה אלינו
// והאישור ללקוחה הם בהכרח אותו סיכום — לא שתי גרסאות שיכולות להיפרד.

const d = he.design;
const m = he.mail;

const mm = (n: number) => `${Math.round(n * 10) / 10} ${d.mm}`;
const money = (n: number) => `${d.ils}${n}`;

/** שורות "מה הוזמן" — הפריט, המידות, והעיצוב. */
export function orderItemLines(o: OrderRow): string[] {
  const ring = o.product_type === "ring";
  const lines = [
    `${m.orderLineItem}: ${ring ? d.ringName : d.braceletName}`,
    o.circumference_mm != null ? `${m.orderLineSize}: ${mm(Number(o.circumference_mm))}` : null,
    o.width_mm != null ? `${m.orderLineWidth}: ${mm(Number(o.width_mm))}` : null,
    !ring && o.fit ? `${m.orderLineFit}: ${d.fits[o.fit]}` : null,
    o.cuts != null ? `${m.orderLineCuts}: ${o.cuts}` : null,
    o.ref ? `${m.orderLineDesign}: ${o.ref}` : null,
  ];
  return lines.filter((l): l is string => l !== null);
}

/**
 * פירוט המחיר (docs/TODO.md B2). עד עכשיו נשלח `סה"כ` בלבד, בזמן שהחישוב כבר
 * ידע את כל הרכיבים — והם נדרשים ממילא לחשבונית.
 *
 * המע"מ הוא השורה האחרונה ולא אחת מהחיבורים: הוא **כלול** בסכום ואינו מתווסף
 * אליו, ושורת מע"מ שיושבת בין הרכיבים לסה"כ נקראת כתוספת.
 */
export function orderPriceLines(o: OrderRow): string[] {
  const p = o.price;
  if (!p) return [];
  return [
    `${m.orderLineBase}: ${money(p.base)}`,
    p.widthAdd ? `${m.orderLineWidthAdd}: ${money(p.widthAdd)}` : null,
    // הפרש ולא סכום: המורכבות הסטנדרטית כבר בתוך הבסיס, ותבנית פשוטה מוזילה.
    p.complexity ? `${m.orderLineComplexity}: ${p.complexity > 0 ? "+" : "−"}${money(Math.abs(p.complexity))}` : null,
    `${m.orderLineShipping}: ${money(p.shipping)}`,
    `${m.orderLineTotal}: ${money(p.total)}`,
    `${m.orderLineTax}: ${money(p.vat)}`,
  ].filter((l): l is string => l !== null);
}

/**
 * הסיכום המלא כטקסט. שורה ריקה בין הגושים היא רווח מכוון — ולכן הסינון כאן
 * הוא על `null` ולא על מחרוזת ריקה. הבאג ההפוך (filter(Boolean)) כבר קרה כאן
 * פעם והפך את המייל לגוש דחוס אחד.
 */
export function orderSummaryText(o: OrderRow): string {
  const address = [o.street, o.city, o.zip].filter(Boolean).join(", ");
  const blocks: Array<string[] | null> = [
    orderItemLines(o),
    orderPriceLines(o),
    address ? [`${m.orderLineAddress}: ${address}`] : null,
    o.brief?.trim() ? [`${m.orderLineBrief}: ${o.brief.trim()}`] : null,
  ];
  return blocks
    .filter((b): b is string[] => b !== null && b.length > 0)
    .map((b) => b.join("\n"))
    .join("\n\n");
}
