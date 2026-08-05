import { he } from "@/i18n/he";
import { escapeHtml } from "./mailLayout";
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

/**
 * צורת הביניים המשותפת: תווית/ערך גולמיים, לפני שנרתמים לתבנית פלט ("label:
 * value" בטקסט, שורת טבלה ב-HTML). מקור אחד לרשימת השדות — טקסט ו-HTML הם שני
 * עיבודים שלו, לא שני מקומות שכותבים אותה רשימה בנפרד.
 */
type Line = { label: string; value: string };

function itemLineParts(o: OrderRow): Line[] {
  const ring = o.product_type === "ring";
  const parts: Array<Line | null> = [
    { label: m.orderLineItem, value: ring ? d.ringName : d.braceletName },
    o.circumference_mm != null
      ? { label: m.orderLineSize, value: mm(Number(o.circumference_mm)) }
      : null,
    o.width_mm != null ? { label: m.orderLineWidth, value: mm(Number(o.width_mm)) } : null,
    !ring && o.fit ? { label: m.orderLineFit, value: d.fits[o.fit] } : null,
    o.cuts != null ? { label: m.orderLineCuts, value: String(o.cuts) } : null,
    o.ref ? { label: m.orderLineDesign, value: o.ref } : null,
  ];
  return parts.filter((l): l is Line => l !== null);
}

/**
 * פירוט המחיר (docs/TODO.md B2). עד עכשיו נשלח `סה"כ` בלבד, בזמן שהחישוב כבר
 * ידע את כל הרכיבים — והם נדרשים ממילא לחשבונית.
 *
 * המע"מ הוא השורה האחרונה ולא אחת מהחיבורים: הוא **כלול** בסכום ואינו מתווסף
 * אליו, ושורת מע"מ שיושבת בין הרכיבים לסה"כ נקראת כתוספת.
 */
function priceLineParts(o: OrderRow): Line[] {
  const p = o.price;
  if (!p) return [];
  const parts: Array<Line | null> = [
    { label: m.orderLineBase, value: money(p.base) },
    p.widthAdd ? { label: m.orderLineWidthAdd, value: money(p.widthAdd) } : null,
    // הפרש ולא סכום: המורכבות הסטנדרטית כבר בתוך הבסיס, ותבנית פשוטה מוזילה.
    p.complexity
      ? {
          label: m.orderLineComplexity,
          value: `${p.complexity > 0 ? "+" : "−"}${money(Math.abs(p.complexity))}`,
        }
      : null,
    { label: m.orderLineShipping, value: money(p.shipping) },
    { label: m.orderLineTotal, value: money(p.total) },
    { label: m.orderLineTax, value: money(p.vat) },
  ];
  return parts.filter((l): l is Line => l !== null);
}

/** שורות "מה הוזמן" — הפריט, המידות, והעיצוב. */
export function orderItemLines(o: OrderRow): string[] {
  return itemLineParts(o).map((l) => `${l.label}: ${l.value}`);
}

export function orderPriceLines(o: OrderRow): string[] {
  return priceLineParts(o).map((l) => `${l.label}: ${l.value}`);
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

const ROW_BORDER = "border-top:1px solid #e7e1d6;";

function linesTable(lines: Line[], opts?: { boldLabel?: string }): string {
  const rows = lines
    .map((l, i) => {
      const bold = opts?.boldLabel === l.label;
      const border = i === 0 ? "" : ROW_BORDER;
      return (
        `<tr>` +
        `<td style="padding:8px 0;${border}color:#667074;font-size:14px;">${escapeHtml(l.label)}</td>` +
        `<td style="padding:8px 0;${border}color:#3d4145;font-size:14px;text-align:left;` +
        `${bold ? "font-weight:700;" : ""}">${escapeHtml(l.value)}</td>` +
        `</tr>`
      );
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="margin:0 0 16px;">${rows}</table>`;
}

/**
 * הסיכום המלא כ-HTML — שתי טבלאות (פריט, מחיר) ואחריהן כתובת ותיאור כפסקאות
 * חופשיות, באותו סדר ואותם שדות כמו `orderSummaryText`.
 */
export function orderSummaryHtml(o: OrderRow): string {
  const address = [o.street, o.city, o.zip].filter(Boolean).join(", ");
  const parts: string[] = [];
  const items = itemLineParts(o);
  if (items.length) parts.push(linesTable(items));
  const price = priceLineParts(o);
  if (price.length) parts.push(linesTable(price, { boldLabel: m.orderLineTotal }));
  if (address) {
    parts.push(
      `<p dir="rtl" style="margin:0 0 16px;"><span style="color:#667074;">${escapeHtml(m.orderLineAddress)}:</span> ${escapeHtml(address)}</p>`,
    );
  }
  if (o.brief?.trim()) {
    parts.push(
      `<p dir="rtl" style="margin:0 0 16px;"><span style="color:#667074;">${escapeHtml(m.orderLineBrief)}:</span> ${escapeHtml(o.brief.trim())}</p>`,
    );
  }
  return parts.join("");
}
