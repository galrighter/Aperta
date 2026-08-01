import { describe, it, expect } from "vitest";
import { convertTextRequests } from "../textToPath";
import { validateDesign } from "@/lib/geometry/validate";
import { textToStencil } from "../stencil";
import { multiPolygonArea } from "@/lib/geometry/poly";
import { FAB, resolveFab } from "@/lib/fabrication.config";

const DIMS = { productType: "bracelet" as const, lengthMm: 160, widthMm: 15, thicknessMm: 1.5 };

const svgWith = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 15"><g id="cutouts">${inner}</g></svg>`;

describe("text-to-path with auto-bridging", () => {
  it("converts a Hebrew name with closed letters into paths that pass V3 (no falling islands)", async () => {
    // "סם" — שתי אותיות עם קונטור סגור; בלי גישור האמצע היה נופל
    const raw = svgWith(`<text-request content="סם" x="80" y="7.5" height="6" align="middle"/>`);
    const converted = await convertTextRequests(raw, DIMS);
    expect(converted).not.toContain("text-request");
    expect(converted).toContain("<path");
    const { report } = validateDesign(converted, DIMS);
    const v3 = report.checks.find((c) => c.check === "V3")!;
    expect(v3.status).toBe("pass");
    const v2 = report.checks.find((c) => c.check === "V2")!;
    expect(v2.status).toBe("pass");
  });

  it("converts Latin text with counters (O, A)", async () => {
    const raw = svgWith(`<text-request content="OA" x="80" y="7.5" height="6" align="middle"/>`);
    const converted = await convertTextRequests(raw, DIMS);
    const { report } = validateDesign(converted, DIMS);
    expect(report.checks.find((c) => c.check === "V3")!.status).toBe("pass");
  });

  it("leaves SVG without text-request untouched", async () => {
    const raw = svgWith(`<circle cx="80" cy="7.5" r="3"/>`);
    expect(await convertTextRequests(raw, DIMS)).toBe(raw);
  });

  it("drops malformed text-request elements", async () => {
    const raw = svgWith(`<text-request content="" x="80"/><circle cx="80" cy="7.5" r="3"/>`);
    const converted = await convertTextRequests(raw, DIMS);
    expect(converted).not.toContain("text-request");
  });
});

// רוחב הגשר נגזר מהקונטור שהוא מחזיק. גשר ברוחב המינימום לייצור (1.5 מ"מ) על
// קונטור של `e` בגובה 6 מ"מ (0.85 מ"מ) לא גישר אלא בלע אותו ואכל את הגזעים —
// והאות שחזרה מהמודל הייתה שבורה, כי כך היא נמסרה לו.
describe("bridge width against the counter it holds", () => {
  const fab = resolveFab(1.5, "ring");
  const LETTER_MIN = FAB.minLetterBridgeMm;

  it("keeps the letter, not just the island", async () => {
    for (const ch of ["e", "a", "o", "R", "ס"]) {
      for (const heightMm of [6, 12]) {
        const plain = await textToStencil(ch, 0, 0, heightMm, "start", 0);
        const bridged = await textToStencil(
          ch, 0, 0, heightMm, "start", fab.minBridgeCut, {}, LETTER_MIN,
        );
        const kept = multiPolygonArea(bridged.polygons) / multiPolygonArea(plain.polygons);
        expect(kept, `${ch} at ${heightMm}mm`).toBeGreaterThan(0.85);
      }
    }
  });

  it("never goes below the letter minimum, however small the counter is", async () => {
    const { tightBridges } = await textToStencil(
      "e", 0, 0, 6, "start", fab.minBridgeCut, {}, LETTER_MIN,
    );
    // החלל של e בגובה 6 מ"מ הוא 0.85 מ"מ — 40% ממנו הם 0.34, מתחת לרצפה.
    expect(tightBridges).toHaveLength(1);
    expect(tightBridges[0].widthMm).toBe(LETTER_MIN);
    expect(tightBridges[0].counterMm).toBeLessThan(LETTER_MIN);
  });

  it("stays silent when the counter has room for the letter minimum", async () => {
    // אות גדולה: היחס לבדו נותן גשר מעל הרצפה, ואין מה לאשר.
    const big = await textToStencil("o", 0, 0, 12, "start", fab.minBridgeCut, {}, LETTER_MIN);
    expect(big.tightBridges).toEqual([]);
  });

  it("never exceeds the structural minimum either", async () => {
    // הרצפה היא רצפה, לא ברירת מחדל: קונטור גדול מקבל את המינימום המלא ולא יותר.
    const huge = await textToStencil("o", 0, 0, 40, "start", fab.minBridgeCut, {}, LETTER_MIN);
    expect(huge.tightBridges).toEqual([]);
  });

  it("still connects the island — a narrower bridge is still a bridge", async () => {
    // ההצדקה לצמצום: הגשר מחזיק אי, הוא לא נושא עומס. הבדיקה היא שאין חור
    // נפרד שנשאר בתוך האות, כלומר שהקונטור מחובר לחומר שסביבו.
    for (const ch of ["e", "o", "ס"]) {
      const { polygons } = await textToStencil(
        ch, 0, 0, 6, "start", fab.minBridgeCut, {}, LETTER_MIN,
      );
      for (const poly of polygons) expect(poly.length, `${ch} keeps an island`).toBe(1);
    }
  });
});
