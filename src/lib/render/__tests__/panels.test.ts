import { describe, expect, it } from "vitest";
import { maxRows, planRender, NATURAL_RATIO } from "../panels";

// החיתוך עצמו נבדק בצד שמריץ אותו — vectorizer/tests/test_panels.py. מה שנשאר
// כאן הוא ההחלטה: כמה פריטים לבקש בתמונה אחת.

/** צמיד סטנדרטי, טבעת סטנדרטית, וצמיד רחב — עם הפתח המינימלי שלהם. */
const BRACELET = { widthMm: 18, minHoleMm: 0.8 };
const RING = { widthMm: 6, minHoleMm: 0.8 };
const WIDE = { widthMm: 27, minHoleMm: 0.8 };

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

  it("returns as many alternatives as it drew — no target, no minimum", () => {
    const wide = planRender({ ratio: 6.4, ...WIDE });
    expect(wide.candidates).toBe(1);
    const narrow = planRender({ ratio: 16, ...RING });
    expect(narrow.candidates).toBe(narrow.rows);
    expect(narrow.rows).toBeGreaterThan(1);
  });

  it("picks the row count whose measured ratio is the one ordered", () => {
    // ההיפוך של NATURAL_RATIO, ולכן העיגול חייב להחזיר את אותו מספר.
    for (const rows of [1, 2, 3, 4, 5, 6]) {
      expect(planRender({ ratio: NATURAL_RATIO(rows), ...RING }).rows).toBe(rows);
    }
  });

  it("never asks for fewer than one piece", () => {
    expect(planRender({ ratio: 1, ...WIDE }).rows).toBe(1);
    expect(planRender({ ratio: 0.1, ...WIDE }).rows).toBe(1);
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
