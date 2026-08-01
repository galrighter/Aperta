import { describe, expect, it } from "vitest";
import { frameCutoutsDims } from "../frameCutouts";
import type { DesignDims } from "../validate";

/**
 * הרוחב שנמסר ללקוחה מול הרוחב שהיא הזמינה.
 *
 * המקרים כאן הם מדידות מהייצור: `drawnRatio` נשמר על כל מועמד, וה-viewBox של
 * הגרסה השמורה אומר מה נמסר בפועל. כולם נחתו על ±5% **בדיוק** — גבול הטווח —
 * וזה מה שחשף שהצמידה לגבול היא ההתנהגות ולא מקרה קצה.
 */

/** cutouts SVG מינימלי במסגרת נתונה: חור אחד באמצע, מספיק כדי לעבור את החוזה. */
function drawn(lengthMm: number, widthMm: number): string {
  const r = Math.min(lengthMm, widthMm) / 8;
  const cx = lengthMm / 2;
  const cy = widthMm / 2;
  const d =
    `M ${cx - r} ${cy} L ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} Z`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lengthMm} ${widthMm}">` +
    `<g id="cutouts"><path d="${d}" fill="black"/></g></svg>`
  );
}

const dims = (lengthMm: number, widthMm: number): DesignDims => ({
  productType: "bracelet",
  lengthMm,
  widthMm,
  thicknessMm: 1.5,
});

describe("הרוחב שנמסר", () => {
  it("קנה מידה אחיד בתוך הטווח — נלקח כמו שהוא", () => {
    // RM-0064 (נמדד): הוזמן 12, נמסר 12.01 / 12.10 / 11.92. המודל צייר קרוב
    // מספיק, קנה המידה אחיד, ואין שום עיוות בדוגמה. זה המקרה שהטווח נועד לו.
    const ordered = dims(61.4, 12);
    // המודל צייר יחס 5.11 מול 5.117 שהוזמן — סטייה של 0.2%
    const out = frameCutoutsDims(ordered, drawn(61.4 * 1.002, 12));
    expect(out.widthMm).toBeGreaterThan(12 * 0.99);
    expect(out.widthMm).toBeLessThan(12 * 1.01);
    expect(out.widthMm).not.toBe(12);
    expect(out.stretch).toBeCloseTo(1, 2);
  });

  it("מחוץ לטווח — הרוחב הוא בדיוק מה שהוזמן, לא גבול הטווח", () => {
    // RM-0068 (נמדד): הוזמן 61.4×10, המודל צייר יחס 7.05 מול 6.14. קנה מידה
    // אחיד היה נותן רוחב 8.71 — 13% מתחת. קודם זה נצמד ל-9.5.
    const out = frameCutoutsDims(dims(61.4, 10), drawn(70.51, 10));
    expect(out.widthMm).toBe(10);
    expect(out.widthMm).not.toBeCloseTo(9.5, 2);
  });

  it("הפער עובר למתיחה ומדווח, במקום להיעלם ברוחב", () => {
    const out = frameCutoutsDims(dims(61.4, 10), drawn(70.51, 10));
    // כל הפער באופק: 61.4/70.51 = 0.871. קודם 5% ממנו נבלעו ברוחב (0.917).
    expect(out.stretch).toBeCloseTo(0.871, 2);
  });

  it("העיצובים שנמדדו — כולם מקבלים עכשיו את הרוחב שהוזמן", () => {
    // רק אלה שה-`drawnRatio` שלהם באמת נשמר על המועמדים. serial, אורך, רוחב
    // שהוזמן, היחס שהמודל צייר, ומה שנמסר קודם.
    const measured: Array<[number, number, number, number, number]> = [
      [63, 160.4, 24, 9.42, 22.8],
      [65, 125, 40, 3.93, 38.0],
      [68, 61.4, 10, 7.05, 9.5],
    ];
    for (const [, L, W, ratio, before] of measured) {
      const out = frameCutoutsDims(dims(L, W), drawn(L, L / ratio));
      expect(out.widthMm).toBe(W);
      expect(out.widthMm).not.toBe(before);
    }
  });

  it("בדיוק על הגבול עדיין נחשב בתוך הטווח", () => {
    // ‎+5% מדויק אינו "מחוץ" — הוא הקצה, וקנה המידה שם עדיין אחיד. הגבול
    // נבדק כאן כדי שלא ייסגר בטעות בעתיד.
    const out = frameCutoutsDims(dims(160.4, 29), drawn(160.4, 29 * 1.05));
    expect(out.widthMm).toBeCloseTo(30.45, 2);
  });

  it("שתי גרסאות של אותה הזמנה מקבלות את אותו רוחב", () => {
    // RM-0062 (נמדד): אותה הזמנה נתנה 10.5 בגרסה אחת ו-9.5 באחרת — 10% הפרש,
    // כי שני המועמדים נצמדו לגבולות מנוגדים.
    const ordered = dims(61.4, 10);
    const wide = frameCutoutsDims(ordered, drawn(61.4 * 0.8, 10));
    const narrow = frameCutoutsDims(ordered, drawn(61.4 * 1.3, 10));
    expect(wide.widthMm).toBe(narrow.widthMm);
    expect(wide.widthMm).toBe(10);
  });
});
