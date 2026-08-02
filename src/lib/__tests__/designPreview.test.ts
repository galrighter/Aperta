import { describe, it, expect } from "vitest";
import { previewOf } from "../designPreview";

// הציור שהכרטיס ב"העיצובים שלי" מצייר, מחושב בשרת מה-SVG של הגרסה. עד היום הוא
// נבנה רק בדפדפן שיצר את העיצוב, ולכן כל עיצוב שנמשך מהשרת הופיע בלי תמונה.

const svg = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 10"><g id="cutouts">${inner}</g></svg>`;

const DIMS = { lengthMm: 60, widthMm: 10 };

describe("previewOf", () => {
  it("draws the material left after the cut-outs", () => {
    const p = previewOf(svg(`<rect x="10" y="3" width="6" height="4"/>`), DIMS);
    expect(p).not.toBeNull();
    expect(p!.cuts).toBe(1);
    expect(p!.lengthMm).toBe(60);
    expect(p!.widthMm).toBe(10);
    // המסגרת החיצונית וטבעת החור — שני תת-מסלולים סגורים.
    expect(p!.path.match(/M/g)).toHaveLength(2);
  });

  it("counts every cut-out, like the result screen does", () => {
    const p = previewOf(
      svg(`<rect x="8" y="3" width="4" height="4"/><circle cx="30" cy="5" r="2"/>`),
      DIMS,
    );
    expect(p!.cuts).toBe(2);
  });

  it("returns null on a design with no cut-outs — normalizeSvg rejects it", () => {
    // אין כאן החלטה משלנו: זו אותה בדיקת חוזה שהוולידציה מריצה. מה שחשוב הוא
    // שהיא חוזרת כ-null ולא כחריגה שמפילה את הבקשה.
    expect(previewOf(svg(""), DIMS)).toBeNull();
  });

  it("returns null instead of throwing on an svg that breaks the contract", () => {
    // הכרטיס יודע להציג את עצמו בלי ציור; בקשה שנופלת בגלל תצוגה מקדימה
    // הייתה לוקחת איתה גם את הכרטיס.
    expect(previewOf("not an svg at all", DIMS)).toBeNull();
  });

  it("returns null without a version, and without dimensions", () => {
    expect(previewOf(null, DIMS)).toBeNull();
    expect(previewOf(svg(""), { lengthMm: 0, widthMm: 10 })).toBeNull();
  });
});
