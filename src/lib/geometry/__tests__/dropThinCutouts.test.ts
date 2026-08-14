import { describe, it, expect } from "vitest";
import { normalizeSvg, dropThinCutouts } from "../normalize";
import { validateNormalized } from "../validate";

// הכלל שמנקה גרסאות שנשמרו לפני שהווקטורייזר התחיל לסנן: מה שאי אפשר לחתוך
// מוסר במקום לפסול את הפס כולו — פתח שלם שקטן מדי (אותו סף בדיוק ש-V5 מריץ),
// וגם חלק דק מדי בתוך פתח שאחרת תקין. השני הוא AP-0165; ראה למטה.

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

  /* AP-0165 (14.8): כל שערה באותה הרצה יצאה **מתוך** פתח אמיתי במקום לשכב
     לידו. כפוליגון אחד הוא רחב לגמרי, ולכן המנקה השאיר אותו שלם עם הזרוע,
     V5 ענה "All cutouts ≥ 0.5mm", ו-V4 הפיל את שלושת המועמדים על הצווארים
     שהזרוע צבטה. שלושה עיצובים נוצרו, אחד הגיע ללקוח. */

  /** אותו עלה, והפעם השערה יוצאת מהשפה הימנית שלו במקום לשכב במרחק. */
  const TENTACLE = `<rect x="23.5" y="6.9" width="12" height="0.2"/>`;

  it("cuts a tentacle off the opening it grows out of", () => {
    const n = normalizeSvg(svg(LEAF + TENTACLE), 160, 15);
    // פוליגון אחד — זו כל הנקודה. `isCuttableOpening` עונה עליו "כן".
    expect(n.cutouts.flat()).toHaveLength(1);

    const cleaned = dropThinCutouts(n, 0.5);
    const bbox = cleaned.cutouts.flat().flat()[0].reduce(
      (m, [x]) => Math.max(m, x), 0,
    );
    expect(bbox).toBeLessThan(25);
  });

  it("does not take the opening down with the tentacle", () => {
    const n = normalizeSvg(svg(LEAF + TENTACLE), 160, 15);
    const cleaned = dropThinCutouts(n, 0.5);
    expect(cleaned.cutouts.flat().length).toBeGreaterThan(0);
    const area = (d: typeof n) => validateNormalized(d, DIMS).metrics.cutAreaMm2;
    // 8 ממ"ר של עלה נשארים; 2.4 ממ"ר של זרוע יורדים.
    expect(area(cleaned)).toBeGreaterThan(7.5);
    expect(area(n) - area(cleaned)).toBeGreaterThan(2);
  });

  it("leaves a clean opening byte for byte — corners included", () => {
    // כיווץ-והרחבה מגלח גם פינה קמורה חדה. אילו זה היה נמחק, כל עיצוב בקטלוג
    // היה נכתב מחדש בכל מסגור; מוסר רק מה שגדול מספיק כדי שצויר.
    const n = normalizeSvg(svg(LEAF), 160, 15);
    expect(dropThinCutouts(n, 0.5).canonicalSvg).toBe(n.canonicalSvg);
  });

  it("barely loses any open area", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    const cleaned = dropThinCutouts(n, 0.5);
    const area = (d: typeof n) => validateNormalized(d, DIMS).metrics.openAreaPct;
    expect(area(n) - area(cleaned)).toBeLessThan(0.02);
  });
});
