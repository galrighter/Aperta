import { describe, it, expect } from "vitest";
import { stampLettering } from "../stampLettering";
import { LETTERING_MODEL } from "@/lib/llm/imagegen";
import { buildLetteringRenderSvg } from "../letteringImage";
import { validateDesign } from "@/lib/geometry/validate";
import { normalizeSvg } from "@/lib/geometry/normalize";
import { multiPolygonArea, intersection, rectPolygon } from "@/lib/geometry/poly";
import { polygonsBBox } from "@/lib/text/stencil";

const DIMS = { lengthMm: 160, widthMm: 15, thicknessMm: 1.2 };
const DD = { productType: "bracelet" as const, ...DIMS };

/** מה שהמודל מחזיר: עיטור לרוחב הפס, ובאמצע משהו שאמור להיות הכיתוב ואיננו. */
const modelOutput = (viewW = 15) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 ${viewW}">` +
  `<g id="cutouts">` +
  // עיטור בשני הקצוות
  `<path d="M8 4L28 4L28 11L8 11Z" fill="black"/>` +
  `<path d="M132 4L152 4L152 11L132 11Z" fill="black"/>` +
  // "הכיתוב" של המודל — צורות שגויות באמצע
  `<path d="M55 5L62 5L62 10L55 10Z" fill="black"/>` +
  `<path d="M70 5L77 5L77 10L70 10Z" fill="black"/>` +
  `<path d="M90 5L97 5L97 10L90 10Z" fill="black"/>` +
  `</g></svg>`;

const cutoutsOf = (svg: string) => normalizeSvg(svg, ...(
  [Number(/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)![1]), Number(/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)![2])] as [number, number]
)).cutUnion;

describe("stampLettering", () => {
  it("replaces whatever the model drew where the lettering goes with the lettering itself", async () => {
    const ref = (await buildLetteringRenderSvg("ענבל", DIMS, "bracelet", 1, ""))!;
    const out = stampLettering(modelOutput(), ref.rows[0].glyphs);

    const [gx0, , gx1] = polygonsBBox(ref.rows[0].glyphs);
    const band = [rectPolygon(gx0, 0, gx1, DIMS.widthMm)];
    const before = multiPolygonArea(intersection(cutoutsOf(modelOutput()), band));
    const after = multiPolygonArea(intersection(cutoutsOf(out), band));
    // מה שהיה שם הוחלף — לא נוסף עליו
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
    expect(Math.abs(after - multiPolygonArea(ref.rows[0].glyphs))).toBeLessThan(1);
  });

  it("leaves the ornament outside the lettering alone", async () => {
    const ref = (await buildLetteringRenderSvg("ענבל", DIMS, "bracelet", 1, ""))!;
    const out = stampLettering(modelOutput(), ref.rows[0].glyphs);
    const ends = [rectPolygon(0, 0, 30, 15), rectPolygon(130, 0, 160, 15)];
    const before = multiPolygonArea(intersection(cutoutsOf(modelOutput()), ends));
    const after = multiPolygonArea(intersection(cutoutsOf(out), ends));
    expect(after).toBeCloseTo(before, 1);
  });

  it("survives the frame being a little narrower than ordered", async () => {
    // המסגור מותח את מה שהמודל צייר, והרוחב יוצא ממנו שונה — 160x14.25 נמדד.
    const ref = (await buildLetteringRenderSvg("ענבל", DIMS, "bracelet", 1, ""))!;
    const out = stampLettering(modelOutput(14.25), ref.rows[0].glyphs);
    expect(out).toContain('viewBox="0 0 160 14.25"');
    const { report } = validateDesign(out, { ...DD, widthMm: 14.25 });
    // האותיות לא נוגעות בגבול ולא נשארו אחריהן איים
    expect(report.checks.find((c) => c.check === "V3")!.status).toBe("pass");
  });

  it("does nothing when there is no lettering to stamp", () => {
    const svg = modelOutput();
    expect(stampLettering(svg, [])).toBe(svg);
  });
});

// המודל שרץ הוא החלטה של forme ולא של הקופסה, ולכן היא נבדקת כאן. ההרצה
// מקצה לקצה מדדה 0/4 שורות נכונות ב-gpt-image-1-mini מול 4/4 ב-gpt-image-2
// על אותה תמונת ייחוס — ההחתמה מתקנת את האיות בשניהם, אבל מה שנשאר סביב
// הכיתוב שונה. ראה HEBREW_TEXT_LETTERING_FIELD.md §6.6.
describe("the model a lettering run asks for", () => {
  it("is not the cheap default the rest of the pipeline uses", () => {
    expect(LETTERING_MODEL).toBe("gpt-image-2");
    expect(LETTERING_MODEL).not.toBe("gpt-image-1-mini");
  });
});
