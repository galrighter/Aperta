import { describe, expect, it } from "vitest";
import { planRender } from "../panels";

// החיתוך עצמו נבדק בצד שמריץ אותו — vectorizer/tests/test_panels.py. מה שנשאר
// כאן הוא ההחלטה: כמה הדמיות לבקש ובאיזו פריסה.

describe("planRender", () => {
  it("uses more rows the longer and thinner the strip is", () => {
    expect(planRender(4, 4).rows).toBe(1);
    expect(planRender(8, 4).rows).toBe(2);
    expect(planRender(16, 4).rows).toBe(6);
  });

  it("never asks for more rows than the model can hold", () => {
    expect(planRender(40, 4).rows).toBe(6);
  });

  it("makes up the candidate count with extra calls when one row is enough", () => {
    const p = planRender(6.4, 4);
    expect(p.rows).toBe(1);
    expect(p.calls).toBe(4);
    expect(p.candidates).toBe(4);
  });

  it("does not spend a second call when the rows already cover the target", () => {
    expect(planRender(16, 4).calls).toBe(1);
  });

  // הטבעת שנפלה ב-27.7: 53x10 → יחס 5.3 → ארבע קריאות נפרדות. זה התכנון שהפיל
  // את ה-Worker כשכל הצינור עוד רץ בתוכו, וזה בדיוק המקרה שעבר לקופסה.
  it("plans four separate renders for a short wide ring", () => {
    const p = planRender(53 / 10, 4);
    expect(p.rows).toBe(1);
    expect(p.calls).toBe(4);
  });
});
