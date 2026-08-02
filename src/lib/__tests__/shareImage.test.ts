import { describe, it, expect } from "vitest";
import { bandHeight, flatSvg } from "../client/shareImage";

// ההרכבה עצמה (קנבס, Image, toDataURL) נבדקה בדפדפן אמיתי; מה שנבדק כאן הוא
// שני החלקים שיכולים להישבר בשקט: ה-SVG שמצייר את הפריסה, וגובה הרצועה שלה.

const RING = { cutouts: `<path d="M1 1h4v4h-4z" fill="black"/>`, lengthMm: 61.4, widthMm: 10 };

describe("flatSvg", () => {
  it("carries the cut-outs inside a mask, so they become real holes", () => {
    const svg = flatSvg(RING, 800, 130);
    // בלי המסכה החיתוכים היו מצוירים כצורות שחורות על המתכת במקום כפתחים.
    expect(svg).toContain(`<mask id="m"`);
    expect(svg).toContain(RING.cutouts);
    expect(svg).toContain(`mask="url(#m)"`);
  });

  it("keeps the version's frame as the viewBox, and the target size as the raster size", () => {
    const svg = flatSvg(RING, 800, 130);
    expect(svg).toContain(`viewBox="0 0 61.4 10"`);
    expect(svg).toContain(`width="800" height="130"`);
  });

  it("uses hyphenated SVG attributes, not the React spelling", () => {
    // `stopColor`/`stopOpacity` הם JSX. כאן זו מחרוזת SVG שנטענת כתמונה, ושם
    // הם פשוט מתעלמים — הפס היה יוצא שחור.
    const svg = flatSvg(RING, 800, 130);
    expect(svg).toContain("stop-color");
    expect(svg).toContain("stop-opacity");
    expect(svg).not.toMatch(/stopColor|stopOpacity/);
  });
});

describe("bandHeight", () => {
  it("gives a ring the height its proportions need", () => {
    // 1120 * 10/61.4 ≈ 182, ועוד 24 אוויר מכל צד.
    expect(bandHeight(RING)).toBe(230);
  });

  it("never lets a very wide piece take over the image", () => {
    expect(bandHeight({ ...RING, lengthMm: 160, widthMm: 42 })).toBe(260);
  });

  it("never squeezes a very thin piece into a line", () => {
    expect(bandHeight({ ...RING, lengthMm: 180, widthMm: 4 })).toBe(140);
  });
});
