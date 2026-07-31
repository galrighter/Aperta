import { describe, it, expect } from "vitest";
import { buildLetteringRenderSvg } from "../letteringImage";
import { BASE_CANVAS } from "../baseImage";
import { validateDesign } from "@/lib/geometry/validate";
import { textToPolygons } from "@/lib/text/stencil";
import { ringToPathD } from "@/lib/geometry/paths";
import { FONT_IDS } from "@/lib/text/fonts";

const CUFF = { lengthMm: 160, widthMm: 15, thicknessMm: 1.2 };
const RING = { lengthMm: 54, widthMm: 8, thicknessMm: 1.2 };

describe("buildLetteringRenderSvg", () => {
  it("draws the lettering as openings in a black strip, on the render canvas", async () => {
    const ref = (await buildLetteringRenderSvg("ענבל", CUFF, "bracelet", 1, ""))!;
    expect(ref).toBeTruthy();
    expect(ref.svg).toContain(`viewBox="0 0 ${BASE_CANVAS.widthPx} ${BASE_CANVAS.heightPx}"`);
    // הפס שחור, והאותיות הן מסכה שפותחת אותו ללבן — הפולריות היא כל העניין
    expect(ref.svg).toContain('fill="#111111"');
    expect(ref.svg).toContain('mask="url(#lt0)"');
    expect(ref.rows).toHaveLength(1);
    expect(ref.rows[0].textWidthMm).toBeGreaterThan(0);
  });

  it("gives every row its own typeface, so the alternatives differ", async () => {
    const ref = (await buildLetteringRenderSvg("ענבל", CUFF, "bracelet", 3, ""))!;
    expect(ref.rows).toHaveLength(3);
    expect(new Set(ref.rows.map((r) => r.fontId)).size).toBe(3);
    // ...ובאותה תמונה אחת, אחרת המגוון היה עולה קריאה נוספת למודל
    for (const i of [0, 1, 2]) expect(ref.svg).toContain(`mask="url(#lt${i})"`);
  });

  it("follows the brief when it asks for a character", async () => {
    const soft = (await buildLetteringRenderSvg("ענבל", CUFF, "bracelet", 1, "צמיד עדין ורומנטי"))!;
    const loud = (await buildLetteringRenderSvg("ענבל", CUFF, "bracelet", 1, "משהו חזק ובולט"))!;
    expect(soft.rows[0].fontId).toBe("delicate");
    expect(loud.rows[0].fontId).toBe("display");
  });

  it("keeps the lettering inside the strip, however long the text", async () => {
    for (const text of ["א", "ענבל רייטר", "כל עוד בלבב פנימה נפש"]) {
      const ref = (await buildLetteringRenderSvg(text, CUFF, "bracelet", 1, ""))!;
      expect(ref).toBeTruthy();
      expect(ref.rows[0].textWidthMm).toBeLessThanOrEqual(CUFF.lengthMm * 0.84 + 0.01);
      expect(ref.rows[0].letterHeightMm).toBeLessThanOrEqual(CUFF.widthMm);
    }
  });

  it("fits a ring too — the same text, a much smaller letter", async () => {
    const cuff = (await buildLetteringRenderSvg("אהבה", CUFF, "bracelet", 1, ""))!;
    const ring = (await buildLetteringRenderSvg("אהבה", RING, "ring", 1, ""))!;
    expect(ring).toBeTruthy();
    expect(ring.rows[0].letterHeightMm).toBeLessThan(cuff.rows[0].letterHeightMm);
  });

  it("says no rather than cutting something illegible", async () => {
    expect(await buildLetteringRenderSvg("", CUFF, "bracelet", 1, "")).toBeNull();
    expect(await buildLetteringRenderSvg("   ", CUFF, "bracelet", 1, "")).toBeNull();
    // טקסט באורך המרבי שה-API מקבל, על טבעת: אין גובה אות שגם נכנס לאורך
    // וגם נשאר קריא — בשום פנים מהמאגר
    const longest = "כל עוד בלבב פנימה נפש יהודי הומיה ולפאתי"; // 40 תווים
    expect(longest).toHaveLength(40);
    expect(await buildLetteringRenderSvg(longest, RING, "ring", 1, "")).toBeNull();
  });
});

// האותיות הן פתחים, ולכן מה שצריך להחזיק הוא החלקים הסגורים שלהן: החלל של
// ם׳ ו-ס׳ הוא אי מתכת שנופל בלי גשר. זו הבדיקה שמגנה על הגישור עצמו.
describe("bridging holds the enclosed parts of letters", () => {
  const dims = { productType: "bracelet" as const, lengthMm: 160, widthMm: 15, thicknessMm: 1.2 };
  const wrap = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 15"><g id="cutouts">${inner}</g></svg>`;

  it.each(FONT_IDS)("leaves no trapped island in %s", async (fontId) => {
    const mp = await textToPolygons("מםעסטד", 20, 3, 8, "start", 1.2, { fontId });
    const svg = wrap(mp.map((p) => `<path d="${p.map(ringToPathD).join("")}" fill="black"/>`).join(""));
    const { report } = validateDesign(svg, dims);
    expect(report.checks.find((c) => c.check === "V3")!.status).toBe("pass");
    expect(report.checks.find((c) => c.check === "V2")!.status).toBe("pass");
  });
});
