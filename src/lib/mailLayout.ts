import { he } from "@/i18n/he";
import { SITE } from "./site.config";

/**
 * המעטפת החזותית למיילים ללקוחות.
 *
 * עד עכשיו כל מייל ללקוחה היה `text/plain` בלבד — בלי לוגו, בלי צבע, בלי
 * מבנה. זה עבד, אבל זו החוויה הראשונה של המותג אחרי הזמנה: מייל שנראה כמו
 * הודעת שגיאה לא בונה את אותו אמון שהאתר בונה.
 *
 * טבלאות ו-CSS מוטבע (inline) ולא Flexbox/Grid ולא `<style>` בראש המסמך:
 * זו לא בחירת עיצוב אלא תאימות — לקוחות מייל (Outlook בראשם) מרנדרים HTML
 * בתת-קבוצה מצומצמת בהרבה מדפדפן, וטבלאות מקוננות הן הדרך היחידה שעובדת
 * בכולם. `dir="rtl"` על כל אלמנט טקסט, כי לא כל לקוח מייל מכבד `dir` שיורש
 * מההורה.
 */

const COLOR = {
  page: "#f4f1eb", // porcelain
  card: "#ffffff",
  border: "#e7e1d6", // porcelain-slab
  ink: "#3d4145", // ink80
  muted: "#667074", // mist
  heading: "#202326", // graphite
  accent: "#3f6297", // lapis
} as const;

const FONT = "Assistant, Arial, Helvetica, sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** פסקה מטקסט חופשי (הודעת לקוחה, למשל) — שומרת שורות ריקות כפסקאות ושברי שורה כ-`<br>`. */
export function textBlockHtml(text: string): string {
  return text
    .split("\n\n")
    .map(
      (block) =>
        `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export function paragraph(text: string): string {
  return `<p dir="rtl" style="margin:0 0 16px;">${escapeHtml(text)}</p>`;
}

/** שורת "תגית: ערך" מודגשת — מספר הזמנה, מספר עיצוב וכדומה. */
export function refLine(label: string, value: string): string {
  return (
    `<p dir="rtl" style="margin:0 0 16px;">` +
    `<span style="color:${COLOR.muted};">${escapeHtml(label)}:</span> ` +
    `<strong style="color:${COLOR.heading};">${escapeHtml(value)}</strong></p>`
  );
}

export function button(label: string, url: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">` +
    `<tr><td style="border-radius:4px;background-color:${COLOR.accent};">` +
    `<a href="${escapeHtml(url)}" target="_blank" ` +
    `style="display:inline-block;padding:13px 32px;font-family:${FONT};font-size:15px;` +
    `font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

export function note(text: string): string {
  return `<p dir="rtl" style="margin:0 0 8px;font-size:13px;color:${COLOR.muted};">${escapeHtml(text)}</p>`;
}

/** קו הפרדה דק בין גושי תוכן (למשל לפני סיכום הזמנה). */
export function divider(): string {
  return `<div style="border-top:1px solid ${COLOR.border};margin:20px 0;"></div>`;
}

/**
 * הטבלה עוטפת גוף HTML מוכן במעטפת המותג המלאה — כותרת עם הלוגו, כרטיס לבן
 * על רקע פורצלן, פוטר עם קישור לאתר. `bodyHtml` הוא כבר HTML (לא נמלט כאן).
 */
export function mailShell(bodyHtml: string): string {
  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background-color:${COLOR.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:${COLOR.card};border:1px solid ${COLOR.border};border-radius:8px;">
<tr>
<td style="padding:28px 32px;text-align:center;border-bottom:1px solid ${COLOR.border};">
<span style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:0.14em;color:${COLOR.heading};">${escapeHtml(he.site.brand.toUpperCase())}</span>
</td>
</tr>
<tr>
<td dir="rtl" style="padding:32px;text-align:right;font-family:${FONT};font-size:15px;line-height:1.7;color:${COLOR.ink};">
${bodyHtml}
</td>
</tr>
<tr>
<td style="padding:20px 32px;border-top:1px solid ${COLOR.border};text-align:center;">
<a href="${SITE.url}" style="font-family:${FONT};font-size:12px;color:${COLOR.muted};text-decoration:none;">${SITE.url.replace(/^https?:\/\//, "")}</a>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
