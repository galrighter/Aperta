import { describe, it, expect } from "vitest";
import { buildBaseRenderSvg, BASE_CANVAS } from "../baseImage";
import { buildRenderPrompt } from "@/lib/llm/imagegen";

const canonical = (inner: string, l = 140, w = 15) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${w}">` +
  `<g id="cutouts">${inner}</g></svg>`;

const CUTS = '<path d="M10 3L30 3L30 12L10 12Z" fill="black"/><path d="M50 3L70 3L70 12L50 12Z" fill="black"/>';

describe("buildBaseRenderSvg", () => {
  it("draws the piece the way a render looks: black metal, openings masked out to white", () => {
    const svg = buildBaseRenderSvg(canonical(CUTS))!;
    expect(svg).toBeTruthy();
    // הפס עצמו — שחור, עם מסכת החיתוכים
    expect(svg).toContain('fill="#111111" mask="url(#cutouts)"');
    // המסכה: לבן = מתכת שנשארת, שחור = החיתוך שנפתח ללבן
    expect(svg).toContain('<rect width="140" height="15" fill="#ffffff"/>');
    expect(svg).toContain('<path d="M10 3L30 3L30 12L10 12Z" fill="#000000"/>');
    expect(svg).toContain('<path d="M50 3L70 3L70 12L50 12Z" fill="#000000"/>');
  });

  it("puts the piece on the render canvas, centred, with white margins", () => {
    const svg = buildBaseRenderSvg(canonical(CUTS))!;
    expect(svg).toContain(`viewBox="0 0 ${BASE_CANVAS.widthPx} ${BASE_CANVAS.heightPx}"`);
    const scale = Number(/scale\(([\d.]+)\)/.exec(svg)![1]);
    // 140mm על קנבס 1536 עם 90% מילוי
    expect(scale).toBeCloseTo((BASE_CANVAS.widthPx * 0.9) / 140, 4);
    const [, tx, ty] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(svg)!;
    expect(Number(tx)).toBeCloseTo(BASE_CANVAS.widthPx * 0.05, 1);
    // הפס דק — הוא מרכזי אנכית, עם הרבה לבן מעל ומתחת
    expect(Number(ty)).toBeGreaterThan(BASE_CANVAS.heightPx * 0.4);
  });

  it("carries nothing but the path data across to the rasteriser", () => {
    const nasty = canonical('<path d="M1 1L2 2Z" fill="black" onload="x()"/><script>y()</script>');
    const svg = buildBaseRenderSvg(nasty)!;
    expect(svg).toContain('d="M1 1L2 2Z"');
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("script");
  });

  it("is null when there is nothing to draw from", () => {
    expect(buildBaseRenderSvg(null)).toBeNull();
    expect(buildBaseRenderSvg("")).toBeNull();
    // אין viewBox
    expect(buildBaseRenderSvg('<svg><g id="cutouts"><path d="M0 0Z"/></g></svg>')).toBeNull();
    // אין חיתוכים — פס חלק אינו רפרנס
    expect(buildBaseRenderSvg(canonical(""))).toBeNull();
  });
});

describe("buildRenderPrompt in edit mode", () => {
  const dims = { lengthMm: 140, widthMm: 15, thicknessMm: 1.2 };

  it("anchors the model on the attached piece instead of describing a new one", () => {
    const edit = buildRenderPrompt("לדלל את החיתוכים", "bracelet", dims, 1, true);
    expect(edit).toContain("The attached image is the CURRENT piece");
    expect(edit).toContain("CHANGE REQUEST (apply only this): לדלל את החיתוכים.");
    expect(edit).not.toContain("Design intent for the piece");
  });

  it("leaves the generate path exactly as it was", () => {
    const fresh = buildRenderPrompt("עלים", "bracelet", dims, 1);
    expect(fresh).toContain("Design intent for the piece: עלים.");
    expect(fresh).not.toContain("CURRENT piece");
  });

  it("keeps the constraints the pipeline depends on in both modes", () => {
    for (const p of [
      buildRenderPrompt("x", "bracelet", dims, 1, true),
      buildRenderPrompt("x", "bracelet", dims, 1, false),
    ]) {
      expect(p).toContain("PROPORTIONS");
      expect(p).toContain("MANUFACTURING");
      expect(p).toContain("NO drop shadow");
    }
  });

  // הרפרנס מראה פריט אחד, הפלט מכיל rows — והמודל צריך לדעת גם את זה וגם מה
  // אמור להיבדל בין השורות.
  it("tells the model the attached piece is drawn N times, varying only the change", () => {
    const edit = buildRenderPrompt("לדלל את החיתוכים", "bracelet", dims, 3, true);
    expect(edit).toContain("the attached image shows the piece once");
    expect(edit).toContain("exactly THREE copies of it");
    expect(edit).toContain("THREE different ways of carrying out that one change");
    // "עיצוב אחר" הוא בדיוק מה שעריכה אינה
    expect(edit).not.toContain("a different design");
  });

  it("still asks for N separate designs when generating", () => {
    const fresh = buildRenderPrompt("עלים", "bracelet", dims, 3);
    expect(fresh).toContain("exactly THREE separate pieces");
    expect(fresh).toContain("the same spirit, a different design");
    expect(fresh).not.toContain("attached image");
  });

  it("says nothing about rows at all when there is only one", () => {
    for (const editing of [true, false]) {
      const p = buildRenderPrompt("x", "bracelet", dims, 1, editing);
      expect(p).toContain("Show the whole piece, unclipped");
      expect(p).not.toContain("LAYOUT:");
    }
  });
});
