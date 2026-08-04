import { describe, expect, it } from "vitest";
import { normalizeSvg } from "../normalize";
import { multiPolygonArea } from "../poly";

/**
 * תת-נתיב בכיוון ליפוף הפוך לדומיננטי — SVG חוקי לגמרי — סווג כ"חור" לפי
 * הסימן בלבד. כשהוא באמת בתוך החומר זו ההכרעה הנכונה; כשהוא צורה נפרדת,
 * `difference` מול חומר זר לו לא עשה כלום והצורה **נעלמה בשקט** מהגאומטריה
 * שנחתכת. הלקוחה הייתה מקבלת פריט שחסר בו חיתוך שהיא רואה על המסך.
 *
 * הצינור החי לא מגיע לכאן: `core/svg_builder.py` מפעיל `orient` מפורש. זה
 * מסלול הייבוא — קלט ל-`/api/validate`, או אימוץ של שיתוף. O5 בדוח.
 */

const L = 40, W = 12;
const svg = (d: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}">` +
  `<g id="cutouts"><path d="${d}" fill="black"/></g></svg>`;

/** ריבוע בכיוון השעון (CW) — הכיוון הדומיננטי בבדיקות כאן. */
const cw = (x: number, y: number, s: number) =>
  `M${x} ${y} L${x + s} ${y} L${x + s} ${y + s} L${x} ${y + s} Z`;
/** אותו ריבוע, בכיוון ההפוך. */
const ccw = (x: number, y: number, s: number) =>
  `M${x} ${y} L${x} ${y + s} L${x + s} ${y + s} L${x + s} ${y} Z`;

const areaOf = (d: string) => multiPolygonArea(normalizeSvg(svg(d), L, W).cutouts.flat());

describe("תת-נתיב בכיוון הפוך", () => {
  /** הטסט של התיקון: בלעדיו הריבוע השני נעלם והשטח יוצא 16 במקום 32. */
  it("צורה נפרדת בכיוון הפוך נשמרת ולא נבלעת כחור", () => {
    const twoSquares = `${cw(4, 4, 4)} ${ccw(24, 4, 4)}`;
    expect(areaOf(twoSquares)).toBeCloseTo(32, 3);
  });

  it("שתי צורות נפרדות באותו כיוון נותנות בדיוק אותו שטח", () => {
    // חוסר התלות בכיוון היא כל הנקודה: אותה צורה, שני ניסוחים חוקיים.
    const sameSign = `${cw(4, 4, 4)} ${cw(24, 4, 4)}`;
    const mixed = `${cw(4, 4, 4)} ${ccw(24, 4, 4)}`;
    expect(areaOf(mixed)).toBeCloseTo(areaOf(sameSign), 3);
  });

  /** ההתנהגות הקיימת חייבת לשרוד: טבעת הפוכה **בתוך** חומר היא עדיין חור. */
  it("טבעת הפוכה בתוך החומר נשארת חור", () => {
    const ringWithHole = `${cw(4, 2, 8)} ${ccw(6, 4, 4)}`;
    expect(areaOf(ringWithHole)).toBeCloseTo(64 - 16, 3);
  });

  it("חור אמיתי לצד צורה נפרדת — כל אחד מטופל לפי מקומו", () => {
    const d = `${cw(4, 2, 8)} ${ccw(6, 4, 4)} ${ccw(24, 4, 4)}`;
    // 64 פחות חור 16, ועוד ריבוע נפרד 16.
    expect(areaOf(d)).toBeCloseTo(64 - 16 + 16, 3);
  });
});
