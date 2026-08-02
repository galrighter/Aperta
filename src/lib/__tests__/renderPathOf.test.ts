import { describe, expect, it } from "vitest";
import { renderPathOf } from "../db/designs";

// נתיב ההדמיה יושב בתוך `validation_report` (jsonb) ולא בעמודה, ולכן הוא מגיע
// מכל גרסה שאי פעם נשמרה — כולל כאלה שנכתבו לפני שהשדה קיים. הקריאה חייבת
// לסבול את כולן: היא רצה גם בבחירת הצעה, וזריקה שם עוצרת שמירת גרסה.

describe("renderPathOf", () => {
  it("returns the path when there is one", () => {
    expect(renderPathOf({ validation_report: { renderPngPath: "renders/d/1-0.png" } }))
      .toBe("renders/d/1-0.png");
  });

  it("treats every shape of absence as null", () => {
    for (const report of [
      null,
      undefined,
      {},
      { renderPngPath: null },
      { renderPngPath: "" },
      { renderPngPath: 42 },
      { renderPngPath: { path: "x" } },
      "not an object",
      [],
    ]) {
      expect(renderPathOf({ validation_report: report })).toBeNull();
    }
  });

  it("is what a picked candidate inherits from the version it came from", () => {
    // ההדמיה שייכת להרצה, לא להצעה. הבחירה יורשת אותה מהגרסה שממנה נבחרה —
    // בלי זה הגרסה הנבחרת נשמרה בלי הדמיה, ושיתוף שלה יצא בלי `og:image`.
    const source = { validation_report: { status: "pass", renderPngPath: "renders/d/1785606356160-0.png" } };
    expect(renderPathOf(source)).toBe("renders/d/1785606356160-0.png");
  });
});
