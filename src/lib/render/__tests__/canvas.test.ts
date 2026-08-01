import { describe, expect, it } from "vitest";
import { LANDSCAPE, PORTRAIT, PORTRAIT_BAND_MM, aspect, canvasFor, sizeParam } from "../canvas";
import { NATURAL_RATIO, maxCols, maxRows, planRender } from "../panels";

const BRACELET = { widthMm: 18, minHoleMm: 0.5 };

describe("canvasFor", () => {
  it("כבוי כברירת מחדל — כל אורך מקבל לרוחב", () => {
    // המתג מגן על פער הפריסה: האפליקציה עולה לפני הקופסה, ובקשה לקנבס
    // שהקופסה לא מכירה הייתה מרנדרת לרוחב מול ייחוס שנבנה לאורך.
    for (const L of [55, 104.4, 125, 153, 160, 215]) {
      expect(canvasFor(L, false)).toBe(LANDSCAPE);
    }
  });

  it("דלוק — רק הפס מקבל לאורך", () => {
    const [lo, hi] = PORTRAIT_BAND_MM;
    expect(canvasFor(lo - 0.1, true)).toBe(LANDSCAPE);
    expect(canvasFor(lo, true)).toBe(PORTRAIT);
    expect(canvasFor(104.4, true)).toBe(PORTRAIT);
    expect(canvasFor(hi, true)).toBe(PORTRAIT);
    expect(canvasFor(hi + 0.1, true)).toBe(LANDSCAPE);
  });

  it("הגבול העליון נגזר מהישרדות הפתח ולא נבחר", () => {
    // 1024·0.9 פיקסלים לאורך; פתח 0.5 מ"מ צריך 3 פיקסלים, כלומר 6 px/mm.
    const survivable = (PORTRAIT.widthPx * 0.9) / (3 / 0.5);
    expect(PORTRAIT_BAND_MM[1]).toBeLessThan(survivable);
    expect(survivable - PORTRAIT_BAND_MM[1]).toBeLessThan(1); // מרווח דק, במכוון
  });

  it("הגבול התחתון הוא בדיוק המקום שבו עמודה שנייה כבר לא זמינה", () => {
    // מתחת ל-80 הפריט מקבל 2 עמודות לרוחב וארבע חלופות — אין מה לקנות.
    expect(maxCols(80, 0.5, LANDSCAPE)).toBe(2);
    expect(maxCols(PORTRAIT_BAND_MM[0], 0.5, LANDSCAPE)).toBe(1);
  });

  it("sizeParam בצורה שהמודל מקבל", () => {
    expect(sizeParam(LANDSCAPE)).toBe("1536x1024");
    expect(sizeParam(PORTRAIT)).toBe("1024x1536");
  });
});

describe("הכללת המתכנן לקנבס", () => {
  it("לרוחב זהה בדיוק למה שהיה — 1.25 ליחס לכל שורה", () => {
    for (const rows of [1, 2, 3, 4, 6]) {
      expect(NATURAL_RATIO(rows)).toBe(5.3 + 1.25 * rows);
      expect(NATURAL_RATIO(rows, 1, LANDSCAPE)).toBe(5.3 + 1.25 * rows);
    }
  });

  it("לאורך: אותו מחובר, צעד קטן פי 2.25", () => {
    expect(aspect(LANDSCAPE) / aspect(PORTRAIT)).toBeCloseTo(2.25, 6);
    expect(NATURAL_RATIO(1, 1, PORTRAIT)).toBeCloseTo(5.86, 2);
    expect(NATURAL_RATIO(3, 1, PORTRAIT)).toBeCloseTo(6.97, 2);
    // המחובר הוא דעתו של המודל על צורת תכשיט, ואינו תלוי בקנבס
    expect(NATURAL_RATIO(0, 1, PORTRAIT)).toBe(NATURAL_RATIO(0, 1, LANDSCAPE));
  });

  it("לאורך מרים את תקרת השורות — הוא נותן להן ציר ארוך יותר", () => {
    expect(maxRows(40, 0.5, LANDSCAPE)).toBe(2);
    expect(maxRows(40, 0.5, PORTRAIT)).toBe(3);
    expect(maxRows(18, 0.5, LANDSCAPE)).toBe(4);
    expect(maxRows(18, 0.5, PORTRAIT)).toBe(7);
  });

  it("לאורך אינו מרשה עמודות בפס — הציר הקצר נותן פחות מקום לאורך", () => {
    for (const L of [80.1, 104.4, 125, 153.2]) {
      expect(maxCols(L, 0.5, PORTRAIT)).toBe(1);
    }
  });

  it("צמיד באמצע הפס מקבל יותר חלופות, וזו כל הנקודה", () => {
    const L = 135;
    const ratio = L / BRACELET.widthMm;
    const land = planRender({ ratio, ...BRACELET, canvas: LANDSCAPE });
    const port = planRender({ ratio, ...BRACELET, canvas: PORTRAIT });
    expect(land.candidates).toBe(2);
    expect(port.candidates).toBe(4);
    expect(port.canvas).toBe(PORTRAIT);
  });

  it("RM-0065 אינו נעזר — היחס שלו מתחת למחובר בשני הקנבסים", () => {
    // 104.4×40, יחס 2.61. `rowsPerColumn` שלילי בשניהם ונחתך ל-1. הפס הזה
    // לא נועד לו, ואין להציג אותו כפתרון שלו.
    const input = { ratio: 104.4 / 40, widthMm: 40, minHoleMm: 0.5 };
    expect(planRender({ ...input, canvas: LANDSCAPE }).candidates).toBe(1);
    expect(planRender({ ...input, canvas: PORTRAIT }).candidates).toBe(1);
  });

  it("ברירת המחדל של planRender היא לרוחב", () => {
    const p = planRender({ ratio: 8.9, ...BRACELET });
    expect(p.canvas).toBe(LANDSCAPE);
    expect(p.rows).toBe(planRender({ ratio: 8.9, ...BRACELET, canvas: LANDSCAPE }).rows);
  });
});
