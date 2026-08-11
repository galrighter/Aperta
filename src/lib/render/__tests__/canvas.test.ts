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
    // ארבע מהיחס (7.5 → 7.52), וחמישית מהסטייה המותרת: 8.08 רחוק 7.8% מ-7.5,
    // בתוך RATIO_SLACK. השישית (8.63) כבר 15% ואינה נלקחת.
    expect(port.candidates).toBe(5);
    expect(port.canvas).toBe(PORTRAIT);
  });

  it("AP-0065 מקבל שורה שנייה לאורך — כי היא בחינם", () => {
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

  it("פס צר וארוך מייצר לפי היחס ומציע שישה", () => {
    // 125×10, יחס 12.5. עד 11.8 `MAX_CANDIDATES` חתך כאן את השורות עצמן, כלומר
    // את צורת התא — והתא הוא הידית היחידה על היחס שהמודל מצייר. עכשיו הוא חל
    // על התצוגה בלבד: מייצרים מה שהיחס דורש (בגבול תקציב הפיקסלים), ומציעים
    // עד שישה.
    const input = { ratio: 12.5, widthMm: 10, minHoleMm: 0.5 };
    for (const canvas of [LANDSCAPE, PORTRAIT]) {
      const p = planRender({ ...input, canvas });
      expect(p.offered).toBeLessThanOrEqual(6);
      expect(p.offered).toBe(Math.min(p.candidates, 6));
      // מה שכן חוסם את הייצור הוא הרזולוציה, ולא מספר החלופות שמציגים.
      expect(p.rows).toBeLessThanOrEqual(maxRows(10, 0.5, canvas));
    }
  });

  /* ===== הסטייה המותרת ביחס (RATIO_SLACK) =====
     עיצוב 90: קנבס לאורך, חלופה אחת, ושאר הקנבס לבן. מספר השורות היה `round`
     של מה שהיחס דורש, ולכן פריט שנפל בין שתי שורות קיבל את התחתונה ולא יותר —
     גם כשהשורה הבאה נשארה בתוך אותו טווח טעות שהעיגול ממילא מרשה. */
  describe("שורות מעל מה שהיחס דרש", () => {
    /** היחס החזוי לכל מספר שורות בקנבס נתון — מה שהסטייה נמדדת מולו. */
    const off = (rows: number, ratio: number, canvas: typeof PORTRAIT) =>
      Math.abs(NATURAL_RATIO(rows, 1, canvas) - ratio) / ratio;

    it("120×20 עולה מחלופה אחת לשתיים — וזה המקרה של עיצוב 90", () => {
      const input = { ratio: 6, widthMm: 20, minHoleMm: 0.5, canvas: PORTRAIT };
      expect(planRender(input).candidates).toBe(2);
      // השנייה בתוך הטווח (6.41 מול 6.0), השלישית מחוצה לו (6.97).
      expect(off(2, 6, PORTRAIT)).toBeLessThanOrEqual(0.1);
      expect(off(3, 6, PORTRAIT)).toBeGreaterThan(0.1);
    });

    it("כל חלופה שנוספה נשארת בתוך הסטייה המוצהרת", () => {
      // הבדיקה האמיתית: לא כמה יצא אלא שמה שיצא לא חורג. 10% הוא מספר שמישהו
      // בחר, והוא צריך להיות ניתן לשינוי בלי שהבדיקות יתחילו לשקר.
      for (const [L, W] of [[120, 20], [130, 18], [135, 18], [140, 18], [150, 18], [110, 18]]) {
        const ratio = L / W;
        const p = planRender({ ratio, widthMm: W, minHoleMm: 0.5, canvas: PORTRAIT });
        if (ratio < 5.3) continue; // מתחת למחובר אין יחס להגן עליו
        expect(off(p.rows / p.cols, ratio, PORTRAIT)).toBeLessThanOrEqual(0.1);
      }
    });

    it("שורה שעולה ברזולוציה אינה נלקחת גם כשהיחס מרשה אותה", () => {
      // 104.4×40 לאורך: `freeRows` הוא 2 (השלישית מורידה את קנה המידה
      // מ-8.83 ל-6.40 px/mm). היחס נמוך מהמחובר, ולכן הסטייה כלל לא נכנסת —
      // מה שעוצר כאן הוא הרזולוציה, ובכוונה.
      const p = planRender({ ratio: 104.4 / 40, widthMm: 40, minHoleMm: 0.5, canvas: PORTRAIT });
      expect(p.rows).toBe(2);
      expect(maxRows(40, 0.5, PORTRAIT)).toBe(3);
    });

    it("לרוחב שום דבר לא זז — שם שורה עולה 1.25 ביחס", () => {
      // זו הבטחת אי-הרגרסיה של השינוי: הקנבס שרוב הפריטים רצים עליו מתוכנן
      // בדיוק כמו קודם, כי צעד של 1.25 חורג מ-10% כמעט בכל יחס.
      for (const [ratio, rows] of [[6.4, 1], [7.5, 2], [8.9, 3], [11.3, 5], [12.5, 6]]) {
        expect(planRender({ ratio, widthMm: 18, minHoleMm: 0.5, canvas: LANDSCAPE }).rows)
          .toBe(Math.min(rows, maxRows(18, 0.5, LANDSCAPE)));
      }
    });

    it("התקרות עדיין חוסמות — הסטייה אינה רשות לפרוץ אותן", () => {
      // פס צר מאוד: היחס מרשה עוד ועוד שורות, ותקציב הפיקסלים עוצר. מ-11.8 זו
      // התקרה היחידה על הייצור — `MAX_CANDIDATES` עבר לתצוגה.
      const p = planRender({ ratio: 20, widthMm: 8, minHoleMm: 0.5, canvas: PORTRAIT });
      expect(p.rows).toBeLessThanOrEqual(maxRows(8, 0.5, PORTRAIT));
      expect(p.offered).toBeLessThanOrEqual(6);
    });
  });

  it("ברירת המחדל של planRender היא לרוחב", () => {
    const p = planRender({ ratio: 8.9, ...BRACELET });
    expect(p.canvas).toBe(LANDSCAPE);
    expect(p.rows).toBe(planRender({ ratio: 8.9, ...BRACELET, canvas: LANDSCAPE }).rows);
  });
});
