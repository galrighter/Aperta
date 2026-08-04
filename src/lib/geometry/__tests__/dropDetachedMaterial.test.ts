import { describe, it, expect } from "vitest";
import { normalizeSvg, dropDetachedMaterial } from "../normalize";
import { difference, rectPolygon, polygonArea } from "../poly";
import { validateNormalized, type DesignDims } from "../validate";

// אי חומר הוא הכשל שהשאיר עיצוב אמיתי (AP-0060) במצב "לא ניתן לייצור": שני
// רכיבי מתכת, שבב של 67.6 מ"מ² שנושר בחיתוך. V2 ו-V3 מדווחים עליו כשני ממצאים
// אבל הוא פגם אחד, ומחיקת הרכיב הקטן סוגרת את שניהם.

const L = 100, W = 30;
const dims: DesignDims = { productType: "bracelet", lengthMm: L, widthMm: W, thicknessMm: 1.5 };

const svg = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}"><g id="cutouts">${paths}</g></svg>`;

const rect = (x: number, y: number, w: number, h: number) =>
  `<path d="M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z" fill="black"/>`;

/**
 * מסגרת חיתוך שכולאת ריבוע מתכת בגודל `inner` בפינה (x,y) — זה האי.
 *
 * ארבעה פסים ולא "חיתוך גדול עם חיתוך קטן בתוכו": הנרמול מאחד cutouts חופפים,
 * ולכן ריבוע בתוך ריבוע פשוט נבלע ואף אי לא נוצר.
 */
const island = (x: number, y: number, inner: number, bar: number) =>
  rect(x - bar, y - bar, inner + 2 * bar, bar) +
  rect(x - bar, y + inner, inner + 2 * bar, bar) +
  rect(x - bar, y, bar, inner) +
  rect(x + inner, y, bar, inner);

const components = (n: { lengthMm: number; widthMm: number; cutUnion: ReturnType<typeof difference> }) =>
  difference([rectPolygon(0, 0, n.lengthMm, n.widthMm)], n.cutUnion);

describe("dropDetachedMaterial", () => {
  it("עיצוב בלי אי לא משתנה — אותו אובייקט חוזר", () => {
    const n = normalizeSvg(svg(rect(10, 10, 8, 8) + rect(40, 10, 8, 8)), L, W);
    expect(dropDetachedMaterial(n, 0.1)).toBe(n);
  });

  it("מסיר את האי ומשאיר גוף אחד", () => {
    // חיתוך חיצוני 12×12 עם ריבוע מתכת 4×4 כלוא בתוכו
    const n = normalizeSvg(svg(island(10, 12, 4, 3)), L, W);
    expect(components(n)).toHaveLength(2);

    const fixed = dropDetachedMaterial(n, 0.1);
    expect(fixed).not.toBe(n);
    expect(components(fixed)).toHaveLength(1);
  });

  it("סוגר גם את V2 וגם את V3 — הם אותו פגם", () => {
    const n = normalizeSvg(svg(island(10, 12, 4, 3)), L, W);
    const before = validateNormalized(n, dims);
    const failed = before.checks.filter((c) => c.status === "fail").map((c) => c.check);
    expect(failed).toContain("V2");
    expect(failed).toContain("V3");

    const after = validateNormalized(dropDetachedMaterial(n, 0.1), dims);
    expect(after.checks.filter((c) => c.status === "fail")).toHaveLength(0);
    expect(after.status).not.toBe("fail");
  });

  it("החומר שנשאר הוא הרכיב הגדול, והאי הוא מה שאבד", () => {
    const n = normalizeSvg(svg(island(10, 12, 4, 3)), L, W);
    const before = components(n).map(polygonArea).sort((a, b) => b - a);
    const after = components(dropDetachedMaterial(n, 0.1)).map(polygonArea);
    expect(after).toHaveLength(1);
    expect(after[0]).toBeCloseTo(before[0], 3);
    // האי הוא 4×4 = 16 מ"מ², והוא הפרש השטח
    expect(before[1]).toBeCloseTo(16, 1);
  });

  it("מעל הסף לא נוגעים — זה כבר עיצוב אחר ולא תיקון", () => {
    // אי של 20×20 = 400 מ"מ² מתוך ~2824 מ"מ² חומר = 14.2%, מעל הסף
    const n = normalizeSvg(svg(island(10, 5, 20, 2)), L, W);
    expect(components(n)).toHaveLength(2);
    expect(dropDetachedMaterial(n, 0.1)).toBe(n);
    // ובסף מתירני יותר הוא כן מוסר
    expect(dropDetachedMaterial(n, 0.5)).not.toBe(n);
  });

  it("ה-SVG שנפלט תקין לפי החוזה וניתן לנרמול חוזר", () => {
    const fixed = dropDetachedMaterial(normalizeSvg(svg(island(10, 12, 4, 3)), L, W), 0.1);
    const again = normalizeSvg(fixed.canonicalSvg, L, W);
    expect(components(again)).toHaveLength(1);
  });
});
