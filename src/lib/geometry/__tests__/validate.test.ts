import { describe, it, expect } from "vitest";
import { validateDesign } from "../validate";
import { normalizeSvg } from "../normalize";
import { resolveFab } from "@/lib/fabrication.config";

const DIMS = { productType: "bracelet" as const, lengthMm: 160, widthMm: 15, thicknessMm: 1.5 };

const svg = (inner: string, L = 160, W = 15) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}"><g id="cutouts">${inner}</g></svg>`;

describe("resolveFab", () => {
  it("applies the minimal-hole policy (0.5mm)", () => {
    const f = resolveFab(1.5, "bracelet");
    expect(f.minHole).toBe(0.5);
    expect(f.minHole).toBe(resolveFab(1.75, "bracelet").minHole); // policy, thickness-independent
  });
  it("interpolates other thickness values", () => {
    const f = resolveFab(1.75, "bracelet");
    expect(f.kerf).toBeCloseTo(0.135, 5);
  });
});

describe("normalizeSvg (contract V1)", () => {
  it("accepts a valid design and converts circles to paths", () => {
    const n = normalizeSvg(svg(`<circle cx="80" cy="7.5" r="3"/>`), 160, 15);
    expect(n.canonicalSvg).toContain(`<g id="cutouts">`);
    expect(n.canonicalSvg).toContain(`<path`);
    expect(n.cutouts).toHaveLength(1);
  });
  it("rejects width/height attributes", () => {
    expect(() =>
      normalizeSvg(`<svg width="160" viewBox="0 0 160 15"><g id="cutouts"><circle cx="80" cy="7.5" r="3"/></g></svg>`, 160, 15),
    ).toThrow(/width/);
  });
  it("rejects wrong viewBox", () => {
    expect(() => normalizeSvg(svg(`<circle cx="80" cy="7.5" r="3"/>`, 150, 15), 160, 15)).toThrow(/viewBox/);
  });
  it("rejects forbidden elements and open paths", () => {
    expect(() => normalizeSvg(svg(`<text x="1" y="1">hi</text>`), 160, 15)).toThrow(/not allowed|text content/);
    expect(() => normalizeSvg(svg(`<path d="M10 5 L20 5 L20 10" fill="black"/>`), 160, 15)).toThrow(/closed/);
  });
  it("clips edge-crossing cutouts to the strip (wavy edge, no throw)", () => {
    // עיגול שחוצה את השפה העליונה — נחתך לרצועה במקום להיזרק; נוצר קצה גלי.
    const n = normalizeSvg(svg(`<circle cx="80" cy="0" r="4"/>`), 160, 15);
    expect(n.cutUnion.length).toBeGreaterThan(0);
    for (const poly of n.cutUnion)
      for (const ring of poly)
        for (const [x, y] of ring) {
          expect(y).toBeGreaterThanOrEqual(-0.02);
          expect(x).toBeGreaterThanOrEqual(-0.02);
          expect(x).toBeLessThanOrEqual(160.02);
        }
  });
  it("strips markdown fences", () => {
    const n = normalizeSvg("```svg\n" + svg(`<circle cx="80" cy="7.5" r="3"/>`) + "\n```", 160, 15);
    expect(n.cutouts).toHaveLength(1);
  });
  it("unions overlapping cutouts", () => {
    const n = normalizeSvg(
      svg(`<circle cx="80" cy="7.5" r="3"/><circle cx="83" cy="7.5" r="3"/>`),
      160, 15,
    );
    expect(n.cutUnion).toHaveLength(1);
    expect(n.cutouts).toHaveLength(1);
  });
});

describe("validateDesign — permissive engine (V1/V2/V3/V4/V5 only)", () => {
  it("passes a clean design and only runs the five kept checks", () => {
    const holes: string[] = [];
    for (let x = 20; x <= 140; x += 8) holes.push(`<circle cx="${x}" cy="7.5" r="1.25"/>`);
    const { report } = validateDesign(svg(holes.join("")), DIMS);
    expect(report.status).toBe("pass");
    expect(report.checks.map((c) => c.check).sort()).toEqual(["V1", "V2", "V3", "V4", "V5"]);
    expect(report.metrics.estWeightGrams).toBeGreaterThan(20);
    expect(report.metrics.estWeightGrams).toBeLessThan(40);
  });

  it("V2: detects disconnected material", () => {
    const { report } = validateDesign(svg(`<rect x="78" y="0" width="4" height="15"/>`), DIMS);
    expect(report.status).toBe("fail");
    expect(report.checks.find((c) => c.check === "V2")!.status).toBe("fail");
  });

  it("V3: detects a material island inside a cutout (annulus)", () => {
    const d = "M75 7.5 A5 5 0 1 0 85 7.5 A5 5 0 1 0 75 7.5 Z M77.5 7.5 A2.5 2.5 0 1 1 82.5 7.5 A2.5 2.5 0 1 1 77.5 7.5 Z";
    const { report } = validateDesign(svg(`<path d="${d}" fill="black"/>`), DIMS);
    const v3 = report.checks.find((c) => c.check === "V3")!;
    expect(v3.status).toBe("fail");
    expect(v3.locations[0].x).toBeCloseTo(80, 0);
  });

  it("V5: flags a hole below the 0.5mm minimum, passes one above it", () => {
    const tiny = validateDesign(svg(`<circle cx="80" cy="7.5" r="0.2"/>`), DIMS).report;
    expect(tiny.checks.find((c) => c.check === "V5")!.status).toBe("fail");
    const ok = validateDesign(svg(`<circle cx="80" cy="7.5" r="0.6"/>`), DIMS).report;
    expect(ok.checks.find((c) => c.check === "V5")!.status).toBe("pass");
  });

  it("does NOT flag former limits (margins, open area, sharp corners)", () => {
    // עיצוב שהיה נכשל/מזהיר בעבר: נוגע בשוליים, אליפסות שטוחות — עכשיו pass.
    // הגשרים כאן הם 1 מ"מ, כלומר מעל הרצפה המוחלטת ומתחת ל-minBridgeCut —
    // בדיוק התחום שהמנוע המתירני מכוון לאפשר.
    const { report } = validateDesign(
      svg(`<rect x="70" y="1" width="8" height="13"/><rect x="79" y="1" width="8" height="13"/>`),
      DIMS,
    );
    // (זה כן מנתק? לא — נשאר מחובר סביב הקצוות) → אין V2 fail, ואין V7/V8
    expect(report.checks.find((c) => c.check === "V4")!.status).toBe("pass");
    expect(report.checks.map((c) => c.check)).not.toContain("V7");
    expect(report.checks.map((c) => c.check)).not.toContain("V8");
  });

  it("V4: fails a neck thinner than the absolute floor, passes one above it", () => {
    // צוואר של 0.2 מ"מ: החומר עדיין גוף אחד, ולכן V2 מרוצה — וזה בדיוק הפגם
    // שעבר את כל הוולידציה ונשבר בחיתוך. הרצפה היא minLetterBridgeMm (0.75)
    // ולא minBridgeCut: גשר של אות יושב בכוונה בין השניים.
    // שני חיתוכים שנוגעים בשפות, ומשאירים ביניהם פס אופקי שהוא **הקישור
    // היחיד** בין חצי הפס השמאלי לימני. רוחב הפס הוא הצוואר.
    const neck = (mm: number) =>
      svg(
        `<rect x="70" y="0" width="16" height="${7.5 - mm / 2}"/>` +
        `<rect x="70" y="${7.5 + mm / 2}" width="16" height="${7.5 - mm / 2}"/>`,
      );
    const thin = validateDesign(neck(0.2), DIMS).report;
    const v4 = thin.checks.find((c) => c.check === "V4")!;
    expect(v4.status).toBe("fail");
    expect(v4.locations.length).toBeGreaterThan(0);
    expect(thin.status).toBe("fail");

    const ok = validateDesign(neck(1), DIMS).report;
    expect(ok.checks.find((c) => c.check === "V4")!.status).toBe("pass");
  });

  it("returns fail with V1 for non-SVG input", () => {
    const { report, normalized } = validateDesign("hello, not svg", DIMS);
    expect(report.status).toBe("fail");
    expect(normalized).toBeNull();
    expect(report.checks[0].check).toBe("V1");
  });
});
