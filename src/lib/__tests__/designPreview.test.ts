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

  it("stays small enough to store, on the traced geometry that made it too big", () => {
    // מתאר של מעקב אמיתי: נקודה כל 0.02–0.05 מ"מ. ב-`mpToPath` זה עשרות אלפי
    // תווים לחיתוך אחד, ומעל 40,000 שני הצדדים זורקים את הציור — כלומר דווקא
    // עיצוב עשיר בחיתוכים הופיע ברשימה בלי תמונה.
    const pts: string[] = [];
    for (let i = 0; i < 900; i++) {
      const t = (i / 900) * Math.PI * 2;
      pts.push(`${(30 + 2.5 * Math.cos(t)).toFixed(4)},${(5 + 2.5 * Math.sin(t)).toFixed(4)}`);
    }
    const p = previewOf(svg(`<path d="M${pts.join("L")}Z"/>`), DIMS);
    expect(p).not.toBeNull();
    expect(p!.path.length).toBeLessThan(40_000);
    // ועדיין צורה: המסגרת והחור, שניהם.
    expect(p!.path.match(/M/g)).toHaveLength(2);
  });

  it("draws on the frame the version sits in, not on the ordered width", () => {
    // המסגור לוקח את הרוחב של קנה מידה אחיד כשהוא בטווח הסטייה, ולכן ה-viewBox
    // כמעט אף פעם אינו הרוחב שהוזמן. `normalizeSvg` אוכף התאמה של 0.01 מ"מ,
    // וכך כל עיצוב שנמשך מהשרת חזר בלי ציור — הבאג שהמסלול הזה נועד לפתור.
    const framed =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 10.34">` +
      `<g id="cutouts"><rect x="10" y="3" width="6" height="4"/></g></svg>`;
    const p = previewOf(framed, DIMS);
    expect(p).not.toBeNull();
    expect(p!.widthMm).toBe(10.34);
    expect(p!.cuts).toBe(1);
  });

  it("returns null without a version, and without dimensions", () => {
    expect(previewOf(null, DIMS)).toBeNull();
    // בלי viewBox אין מסגרת לקרוא, והמידות שנמסרו הן מה שיש — כאן, אין.
    const noViewBox =
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<g id="cutouts"><rect x="10" y="3" width="6" height="4"/></g></svg>`;
    expect(previewOf(noViewBox, { lengthMm: 0, widthMm: 10 })).toBeNull();
  });
});
