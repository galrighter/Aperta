import { describe, expect, it } from "vitest";
import { rescaleCutoutsSvg, svgFrame } from "../frame";

const svg = (vb: string, d: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g id="cutouts" fill="black"><path d="${d}"/></g></svg>`;

describe("svgFrame", () => {
  it("reads the strip dimensions from the viewBox", () => {
    expect(svgFrame(svg("0 0 44.52 8", "M0 0L1 1Z"))).toEqual({ lengthMm: 44.52, widthMm: 8 });
  });

  it("returns null rather than a guess when there is nothing to read", () => {
    expect(svgFrame(null)).toBeNull();
    expect(svgFrame("<svg></svg>")).toBeNull();
    expect(svgFrame(svg("0 0 0 8", "M0 0Z"))).toBeNull();
  });
});

describe("rescaleCutoutsSvg", () => {
  it("stretches coordinates and the viewBox to the target frame", () => {
    const out = rescaleCutoutsSvg(svg("0 0 10 4", "M0 0L10 4L5 2Z"), { lengthMm: 20, widthMm: 4 });
    expect(svgFrame(out)).toEqual({ lengthMm: 20, widthMm: 4 });
    expect(out).toContain('d="M0 0L20 4L10 2Z"');
  });

  it("scales both axes independently", () => {
    const out = rescaleCutoutsSvg(svg("0 0 10 4", "M2 1Z"), { lengthMm: 5, widthMm: 8 });
    expect(out).toContain('d="M1 2Z"');
  });

  it("returns the input untouched when the frame already matches", () => {
    const src = svg("0 0 10 4", "M0 0L10 4Z");
    expect(rescaleCutoutsSvg(src, { lengthMm: 10, widthMm: 4 })).toBe(src);
  });

  it("stretches a cubic exactly, through its control points", () => {
    // מאז #198 הווקטורייזר פולט C. בזייה שקופה לטרנספורמציה אפינית: מתיחת
    // נקודות הבקרה היא מתיחה מדויקת של העקומה — לא קירוב. בלי התמיכה הזו כל
    // יצירה נפלה על `internal · 500` שלוש שעות אחרי שהמיזוג עלה (10.8).
    const out = rescaleCutoutsSvg(
      svg("0 0 10 4", "M0 0C2 1 4 3 10 4L5 2Z"),
      { lengthMm: 20, widthMm: 8 },
    );
    expect(svgFrame(out)).toEqual({ lengthMm: 20, widthMm: 8 });
    expect(out).toContain('d="M0 0C4 2 8 6 20 8L10 4Z"');
  });

  it("scales the quadratic family the same way", () => {
    const out = rescaleCutoutsSvg(
      svg("0 0 10 4", "M0 0Q2 1 4 2T8 4S9 1 10 0Z"),
      { lengthMm: 20, widthMm: 4 },
    );
    expect(out).toContain('d="M0 0Q4 1 8 2T16 4S18 1 20 0Z"');
  });

  it("refuses a path command it cannot scale, instead of guessing", () => {
    // קשת נחתכת במתכת; פרשנות שגויה שלה היא פריט פגום, לא באג ויזואלי —
    // ובמתיחה לא-אחידה הרדיוסים של A פשוט אינם נמתחים דרך המספרים שלהם.
    expect(() => rescaleCutoutsSvg(svg("0 0 10 4", "M0 0A5 5 0 0 1 10 4Z"), { lengthMm: 20, widthMm: 4 }))
      .toThrow(/unsupported path command/);
  });
});
