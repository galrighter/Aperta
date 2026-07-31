import { normalizeSvg, dropThinCutouts } from "@/lib/geometry/normalize";
import { union, difference, intersection, rectPolygon, multiPolygonArea } from "@/lib/geometry/poly";
import { ringToPathD } from "@/lib/geometry/paths";
import { polygonsBBox, translatePolygons } from "@/lib/text/stencil";
import { svgFrame } from "@/lib/geometry/frame";

import type { MultiPolygon } from "@/lib/geometry/types";

// החתמת הכיתוב על התוצאה — שלב הווקטור, אחרי שהמודל החזיר את העיצוב.
//
// **למה זה קיים.** תמונת הייחוס נושאת את הכיתוב חתוך מהפונט שלנו, והפרומפט
// מבקש להעתיק אותו כמו שהוא. נמדד מקצה לקצה על הצינור האמיתי (31/07):
//
//   gpt-image-1-mini (הפרודקשן, quality low) — 0 מתוך 4 שורות נכונות.
//     `פספסתי רייטר` חזר `כפפיכי רויין`, `כיצפי ריינן`, `פפפפ ריינר`.
//   gpt-image-2 — 2 מתוך 4. הכשלים בדיוק באותיות המגושרות: ס׳→כ׳, ט׳→ע׳.
//
// כלומר המודל קורא את חריץ הגישור כפגם ו"מתקן" אותו לאות אחרת — אותו רפלקס
// שהפך `appologize` ל-`APOLOGIZE`. ההוראה בפרומפט לא עוצרת אותו.
//
// הווקטורייזר, לעומת זאת, **נקי**: IoU 0.95–0.99, מספר החורים נשמר בדיוק,
// והאותיות קריאות אחרי המעקב. כלומר הבעיה כולה במודל, ואף ניסוח לא יסגור
// אותה — מה שהמודל מחזיר הוא רסטר שהוא צייר מחדש.
//
// לכן מהמודל נלקח **רק העיטור**, והאותיות מוחזרות מהפונט: מפנים את המלבן שבו
// הכיתוב יושב ומאחדים לתוכו את הנתיבים המקוריים. זה הופך את האיות ממשהו
// שמקווים לו למשהו שנכון בבנייה.

/**
 * כמה מרווח לפנות מסביב לכיתוב.
 *
 * נגזר מ**רוחב הכיתוב** ולא מגובה האות: מה שהמודל כותב במקום האותיות שלנו
 * לא רק מעוות אלא גם ארוך יותר, והסטייה מצטברת לאורך המילה. נמדד — מודל
 * הפרודקשן כתב `פפפיסוי רייטר` וגלש כמה מ"מ מעבר לתיבה שלנו, והשאריות נראות
 * כמו אותיות זרות צמודות לכיתוב. עשירית מרוחב הכיתוב מכסה את הסטייה שנמדדה
 * ועדיין רחוקה מהעיטור, שיושב בקצוות. רצפה של 1.2 מ"מ כדי שגם כיתוב קצר
 * יקבל אוויר.
 */
const clearance = (textWidthMm: number) => Math.max(1.2, textWidthMm * 0.1);


// מה שלא נעשה, ובכוונה: לסנן שאריות לפי צורה. כשהמודל כותב יותר אותיות
// משלנו, חלקן נוחתות מעבר למלבן ונראות כמו אותיות זרות צמודות לכיתוב. נוסה
// סינון של כל חיתוך שכולו בתוך רצועת הכיתוב וקרוב אליה — הוא הסיר חלק
// מהשאריות, אבל גם קטע גבעולים של הענף שעברו באותה רצועה. העיצוב נפגע יותר
// ממה שנוקה. השאריות נשארות, וההערכה של המודל היא זו שצריכה להשתפר:
// gpt-image-2 מייצר כיתוב ברוחב שלנו ולא משאיר כלום.

/**
 * מחליף את מה שהמודל צייר במקום הכיתוב בכיתוב עצמו.
 *
 * `svg` הוא ה-SVG הממוסגר של המועמד ו-`glyphs` הם אותם פוליגונים שנשלחו
 * בתמונת הייחוס. המסגרת נקראת מה-SVG עצמו ולא מתקבלת כפרמטר: המסגור מותח
 * את מה שהמודל צייר למידה שהוזמנה, והרוחב יוצא ממנו שונה במעט (160×14.25
 * במקום 160×15 במדידה אמיתית). האותיות רק **מוזזות** למרכז המסגרת שהתקבלה
 * ולא נמתחות איתה — מתיחה הייתה מעוותת אותן, וזה כל מה שהשלב הזה בא למנוע.
 *
 * מחזיר את ה-SVG כמו שהוא אם אין מה להחתים, כדי שמסלול בלי כיתוב לא ישלם
 * על בנייה מחדש.
 */
export function stampLettering(svg: string, glyphs: MultiPolygon, minHoleMm = 0): string {
  if (!glyphs.length) return svg;
  const frame = svgFrame(svg);
  if (!frame) return svg;
  const { lengthMm, widthMm } = frame;

  const box = polygonsBBox(glyphs);
  if (!isFinite(box[0])) return svg;
  glyphs = translatePolygons(
    glyphs,
    lengthMm / 2 - (box[0] + box[2]) / 2,
    widthMm / 2 - (box[1] + box[3]) / 2,
  );
  const [gx0, , gx1] = polygonsBBox(glyphs);

  const n = normalizeSvg(svg, lengthMm, widthMm);
  const strip: MultiPolygon = [rectPolygon(0, 0, lengthMm, widthMm)];

  // המלבן שמתפנה: טווח האותיות לרוחב, ו**כל גובה הפס**. גובה חלקי משאיר
  // שאריות — מה שהמודל צייר במקום האותיות גולש מעט מעל ומתחת לתיבה שלהן,
  // והשאריות האלה נראות כמו לכלוך צמוד לכיתוב. ממילא אין מקום לעיטור מעל
  // ומתחת: אות בגובה 7.5 מ"מ על פס של 15 משאירה כ-3 מ"מ לכל צד.
  const pad = clearance(gx1 - gx0);
  const clear = intersection([rectPolygon(gx0 - pad, -1, gx1 + pad, widthMm + 1)], strip);

  // האותיות עצמן נחתכות לפס גם הן: אם המסגור מתח את המועמד, קצה אות עלול
  // לצאת מהגבול, ו-V-checks פוסלים חיתוך שנוגע בו.
  const letters = intersection(glyphs, strip);
  if (multiPolygonArea(letters) <= 1e-6) return svg;

  const cutouts = union(difference(n.cutUnion, clear), letters);

  const fmt = (v: number) => {
    const r = Math.round(v * 1000) / 1000;
    return Object.is(r, -0) ? "0" : String(r);
  };
  const paths = cutouts
    .map((poly) => `<path d="${poly.map((r) => ringToPathD(r)).join("")}" fill="black"/>`)
    .join("");
  const out =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(lengthMm)} ${fmt(widthMm)}">` +
    `<g id="cutouts">${paths}</g></svg>`;

  // חיתוך העיטור בגבול המלבן משאיר שבבים דקים מהפתח המינימלי, וכל אחד מהם
  // מפיל את המועמד ב-V5 — נמדד על שניים מארבעה מועמדים. אותו ניקוי שהמסגור
  // עושה ממילא (`dropThinCutouts`), רק אחרי ההחתמה ולא לפניה.
  if (minHoleMm <= 0) return out;
  return dropThinCutouts(normalizeSvg(out, lengthMm, widthMm), minHoleMm).canonicalSvg;
}
