import { describe, it, expect } from "vitest";
import { normalizeSvg, dropThinCutouts } from "../normalize";
import { validateNormalized } from "../validate";

// הכלל שמנקה גרסאות שנשמרו לפני שהווקטורייזר התחיל לסנן: פתח שאי אפשר לחתוך
// מוסר במקום לפסול את הפס כולו. אותה בדיקה בדיוק ש-V5 מריץ.

const DIMS = { productType: "bracelet" as const, lengthMm: 160, widthMm: 15, thicknessMm: 1.5 };
const svg = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 15"><g id="cutouts">${inner}</g></svg>`;

/** עלה של 4x2 מ"מ, ולידו השערה שהטרייסר משאיר — 1.5x0.17 מ"מ, כמו במדידה אמיתית. */
const LEAF = `<rect x="20" y="6" width="4" height="2"/>`;
const HAIR = `<rect x="30" y="7" width="1.5" height="0.17"/>`;

describe("dropThinCutouts", () => {
  it("drops the hairline and keeps the opening beside it", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    expect(n.cutouts).toHaveLength(2);
    const cleaned = dropThinCutouts(n, 0.5);
    expect(cleaned.cutouts).toHaveLength(1);
    expect(cleaned.canonicalSvg).toContain(`<g id="cutouts">`);
  });

  it("turns a design V5 rejects into one it accepts", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    const before = validateNormalized(n, DIMS);
    expect(before.checks.find((c) => c.check === "V5")!.status).toBe("fail");

    const after = validateNormalized(dropThinCutouts(n, 0.5), DIMS);
    expect(after.checks.find((c) => c.check === "V5")!.status).toBe("pass");
  });

  it("returns the same object when there is nothing to drop", () => {
    // המסלול הנפוץ: לא בונים SVG מחדש ולא נוגעים ב-d המקורי לחינם.
    const n = normalizeSvg(svg(LEAF), 160, 15);
    expect(dropThinCutouts(n, 0.5)).toBe(n);
  });

  it("a zero minimum keeps everything", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    expect(dropThinCutouts(n, 0)).toBe(n);
  });

  it("barely loses any open area", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    const cleaned = dropThinCutouts(n, 0.5);
    const area = (d: typeof n) => validateNormalized(d, DIMS).metrics.openAreaPct;
    expect(area(n) - area(cleaned)).toBeLessThan(0.02);
  });
});
