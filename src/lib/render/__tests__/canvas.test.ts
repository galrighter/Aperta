import { describe, expect, it } from "vitest";
import {
  LANDSCAPE, PORTRAIT, PORTRAIT_BAND_MM, aspect, canvasFor, portraitEnabled, sizeParam,
} from "../canvas";
import { NATURAL_RATIO, maxCols, maxRows, planRender } from "../panels";

const BRACELET = { widthMm: 18, minHoleMm: 0.5 };

describe("canvasFor", () => {
  it("כבוי — כל אורך מקבל לרוחב", () => {
    // דרך החזרה אחורה: `PORTRAIT_CANVAS=0`. בלי revert ובלי פריסה מחדש.
    for (const L of [55, 104.4, 125, 153, 160, 215]) {
      expect(canvasFor(L, false)).toBe(LANDSCAPE);
    }
  });

  it("דלוק כברירת מחדל, וכבוי רק על '0' מפורש", () => {
    const before = process.env.PORTRAIT_CANVAS;
    try {
      delete process.env.PORTRAIT_CANVAS;
      expect(portraitEnabled()).toBe(true);
      process.env.PORTRAIT_CANVAS = "1";
      expect(portraitEnabled()).toBe(true);
      process.env.PORTRAIT_CANVAS = "0";
      expect(portraitEnabled()).toBe(false);
      // רק "0" מכבה. ערך שלא מזוהה משאיר דלוק, כי כיבוי בטעות הוא חזרה
      // שקטה להתנהגות שנזנחה — בדיוק סוג הדבר שלא מבחינים בו.
      process.env.PORTRAIT_CANVAS = "false";
      expect(portraitEnabled()).toBe(true);
    } finally {
      if (before === undefined) delete process.env.PORTRAIT_CANVAS;
      else process.env.PORTRAIT_CANVAS = before;
    }
  });

  it("ברירת המחדל של canvasFor עוברת דרך המתג", () => {
    const before = process.env.PORTRAIT_CANVAS;
    try {
      delete process.env.PORTRAIT_CANVAS;
      expect(canvasFor(135)).toBe(PORTRAIT);
      expect(canvasFor(160)).toBe(LANDSCAPE);
    } finally {
      if (before === undefined) delete process.env.PORTRAIT_CANVAS;
      else process.env.PORTRAIT_CANVAS = before;
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

  it("RM-0065 מקבל שורה שנייה לאורך — כי היא בחינם", () => {
    // 104.4×40, יחס 2.61 — מתחת למחובר, ולכן `rowsPerColumn` שלילי בשני
    // הקנבסים ואין מספר שורות ש"מתאים" ליחס. במצב הזה נלקחות השורות שאינן
    // עולות דבר: לאורך, שורה אחת ושתיים נותנות **8.83 px/mm שתיהן**, כי החסם
    // הוא ציר האורך ולא רוחב הפס. השלישית כבר יורדת ל-6.40 ולכן אינה נלקחת.
    const input = { ratio: 104.4 / 40, widthMm: 40, minHoleMm: 0.5 };
    expect(planRender({ ...input, canvas: LANDSCAPE }).candidates).toBe(1);
    expect(planRender({ ...input, canvas: PORTRAIT }).candidates).toBe(2);
  });

  it("שורה חינמית נלקחת רק כשהיא באמת לא עולה ברזולוציה", () => {
    // אותו פריט: קנה המידה זהה ב-1 ו-2 שורות, ויורד ב-3. התכנון עוצר לפני
    // הירידה — לא ב-`rowCap`, שמרשה 3.
    const scale = (rows: number) =>
      Math.min((PORTRAIT.widthPx * 0.9) / 104.4, ((PORTRAIT.heightPx * 0.5) / rows) / 40);
    expect(scale(2)).toBeCloseTo(scale(1), 6);
    expect(scale(3)).toBeLessThan(scale(1));
    expect(maxRows(40, 0.5, PORTRAIT)).toBe(3);
    expect(planRender({ ratio: 104.4 / 40, widthMm: 40, minHoleMm: 0.5, canvas: PORTRAIT }).rows).toBe(2);
  });

  it("התקרה חלה גם על שורות — פס צר וארוך אינו מחזיר תריסר", () => {
    // 125×10, יחס 12.5. עד כה `MAX_CANDIDATES` נאכף רק בלולאת העמודות: לרוחב
    // זה נתן 6 (במקרה בדיוק על הגבול), ולאורך 12.
    const input = { ratio: 12.5, widthMm: 10, minHoleMm: 0.5 };
    expect(planRender({ ...input, canvas: LANDSCAPE }).candidates).toBeLessThanOrEqual(6);
    expect(planRender({ ...input, canvas: PORTRAIT }).candidates).toBeLessThanOrEqual(6);
  });

  it("ברירת המחדל של planRender היא לרוחב", () => {
    const p = planRender({ ratio: 8.9, ...BRACELET });
    expect(p.canvas).toBe(LANDSCAPE);
    expect(p.rows).toBe(planRender({ ratio: 8.9, ...BRACELET, canvas: LANDSCAPE }).rows);
  });
});
