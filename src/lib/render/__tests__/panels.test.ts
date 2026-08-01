import { describe, expect, it } from "vitest";
import { maxCols, maxRows, planRender, NATURAL_RATIO } from "../panels";

// החיתוך עצמו נבדק בצד שמריץ אותו — vectorizer/tests/test_panels.py. מה שנשאר
// כאן הוא ההחלטה: כמה פריטים לבקש בתמונה אחת.

/** צמיד סטנדרטי, טבעת סטנדרטית, וצמיד רחב — עם הפתח המינימלי שלהם. */
const BRACELET = { widthMm: 18, minHoleMm: 0.8 };
const RING = { widthMm: 6, minHoleMm: 0.8 };
const WIDE = { widthMm: 27, minHoleMm: 0.8 };
/** טבעת רחבה: 55.5 מ"מ אורך על 12 מ"מ רוחב — יחס 4.6, ולכן שורה אחת. */
const WIDE_RING = { widthMm: 12, minHoleMm: 0.8 };

describe("planRender", () => {
  it("asks for more pieces the longer and thinner the strip is", () => {
    expect(planRender({ ratio: 6.4, ...WIDE }).rows).toBe(1);
    expect(planRender({ ratio: 8.9, ...BRACELET }).rows).toBe(3);
    expect(planRender({ ratio: 11.3, ...BRACELET }).rows).toBe(5);
  });

  it("always spends exactly one call, whatever the ratio", () => {
    // זה הסעיף שהשתנה: קודם יחס נמוך היה מתורגם לארבע קריאות נפרדות, ויחס
    // בינוני לשתיים. הכפילות הזאת קנתה מועמדים שאיש לא ביקש.
    for (const ratio of [4, 6.4, 8.9, 11.3, 16, 40]) {
      expect(planRender({ ratio, ...BRACELET }).calls).toBe(1);
    }
  });

  it("returns one alternative per cell of the grid it drew", () => {
    const narrow = planRender({ ratio: 16, ...RING });
    expect(narrow.candidates).toBe(narrow.rows * narrow.cols);
    expect(narrow.rows).toBeGreaterThan(1);
  });

  it("stays in one column when the piece is long — there is no room for two", () => {
    for (const ratio of [6.4, 8.9, 11.3]) {
      expect(planRender({ ratio, ...BRACELET }).cols).toBe(1);
    }
    expect(planRender({ ratio: 6.4, ...WIDE }).cols).toBe(1);
  });

  it("gives a short piece a second column instead of a single alternative", () => {
    // טבעת רחבה: היחס נמוך כי הטבעת קצרה, ולכן שורה אחת — חלופה אחת. הקוצר
    // הזה עצמו הוא מה שמאפשר עמודה שנייה.
    const ring = planRender({ ratio: 4.6, ...WIDE_RING });
    expect(ring.cols).toBe(2);
    expect(ring.rows).toBe(2);
    expect(ring.candidates).toBe(4);
  });

  it("keeps the cell shape when it adds a column, so the drawn ratio is unchanged", () => {
    const ring = planRender({ ratio: 4.6, ...WIDE_RING });
    expect(NATURAL_RATIO(ring.rows, ring.cols)).toBe(NATURAL_RATIO(1, 1));
  });

  it("does not add a column that would overshoot what the screen shows", () => {
    // טבעת ברירת מחדל מקבלת שלוש שורות; עמודה שנייה הייתה מכפילה אותן לשתים־עשרה.
    const ring = planRender({ ratio: 9.25, ...RING });
    expect(ring.rows).toBe(3);
    expect(ring.cols).toBe(1);
  });

  it("picks the cell shape whose measured ratio is the one ordered", () => {
    // ההיפוך של NATURAL_RATIO. מה שנשמר הוא צורת התא — שורות **לעמודה** — ולא
    // מספר השורות עצמו, שעמודה נוספת מכפילה יחד עם העמודות.
    for (const rows of [1, 2, 3, 4, 5, 6]) {
      const p = planRender({ ratio: NATURAL_RATIO(rows), ...RING });
      expect(p.rows / p.cols).toBe(rows);
      expect(NATURAL_RATIO(p.rows, p.cols)).toBeCloseTo(NATURAL_RATIO(rows), 10);
    }
  });

  it("never asks for fewer than one piece per cell", () => {
    for (const ratio of [1, 0.1]) {
      const p = planRender({ ratio, ...WIDE });
      expect(p.rows).toBeGreaterThanOrEqual(p.cols);
      expect(p.rows / p.cols).toBe(1);
    }
  });
});

describe("maxCols", () => {
  it("allows a second column only when the piece is short", () => {
    expect(maxCols(55.5, 0.8)).toBe(2);
    expect(maxCols(160, 0.8)).toBe(1);
    expect(maxCols(215, 0.8)).toBe(1);
  });

  it("is a quality floor and not only a survival one", () => {
    // תקציב הפתח לבדו היה מתיר עמודה שנייה על צמיד ארוך (3.2 פיקסלים לפתח);
    // חסם הצפיפות — לא פחות ממה שצמיד באורך ברירת המחדל מקבל היום — חוסם אותה.
    expect(maxCols(172.8, 0.8)).toBe(1);
  });

  it("never drops below one", () => {
    expect(maxCols(1000, 0.1)).toBe(1);
  });
});

describe("maxRows", () => {
  it("is a pixel budget, not a taste: a wider piece can hold fewer", () => {
    expect(maxRows(27, 0.8)).toBeLessThan(maxRows(18, 0.8));
    expect(maxRows(18, 0.8)).toBeLessThan(maxRows(6, 0.8));
  });

  it("rises when the smallest cuttable opening is larger", () => {
    expect(maxRows(18, 1.2)).toBeGreaterThan(maxRows(18, 0.8));
  });

  it("caps an extreme ratio instead of asking for an untraceable strip", () => {
    // יחס 40 היה מבקש 28 שורות; על פריט ברוחב 27 מ"מ הפתח המינימלי לא היה
    // שורד את המעקב הרבה לפני כן.
    const p = planRender({ ratio: 40, ...WIDE });
    expect(p.rows).toBe(maxRows(WIDE.widthMm, WIDE.minHoleMm));
    expect(p.rows).toBeLessThan(28);
  });

  it("never drops below one, even for an absurdly wide piece", () => {
    expect(maxRows(500, 0.1)).toBe(1);
  });
});
