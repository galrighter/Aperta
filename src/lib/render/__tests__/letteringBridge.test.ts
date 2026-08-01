import { describe, expect, it } from "vitest";
import { buildLetteringRenderSvg } from "../letteringImage";

// הכיתוב נחתך מהפונט אצלנו, ולכן גשר צר מהמינימום לייצור הוא משהו שאנחנו
// יודעים לפני שהמודל צייר משהו. הלקוחה צריכה לדעת עליו.

const RING = { lengthMm: 61.4, widthMm: 12, thicknessMm: 1.5 };
const BRIEF = "טבעת בסגנון אדריכלי";

describe("lettering bridges", () => {
  it("reports how much of the counter the bridge had to take", async () => {
    // אות בגובה 6 מ"מ על טבעת: החלל של e קטן מכדי להחזיק גשר יחסי, והגשר
    // נשאר על המינימום לאות.
    const ref = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF);
    expect(ref).not.toBeNull();
    expect(ref!.tightShare).not.toBeNull();
    // מעל היחס שהיה נבחר לו היה מקום, ומתחת לחלל כולו.
    expect(ref!.tightShare!).toBeGreaterThan(0.4);
    expect(ref!.tightShare!).toBeLessThan(1);
    // הדיווח הוא הפגיעה הגדולה ביותר מכל השורות שהוצעו, ולא של הראשונה בלבד.
    const perRow = ref!.rows.map((r) => r.tightShare).filter((v): v is number => v != null);
    expect(ref!.tightShare).toBe(Math.max(...perRow));
  });

  it("stays silent for lettering whose counters hold a proportional bridge", async () => {
    // צמיד רחב: אותה מילה נחתכת גדולה בהרבה, ולכל חלל יש מקום לגשר.
    const cuff = { lengthMm: 160, widthMm: 40, thicknessMm: 1.5 };
    const ref = await buildLetteringRenderSvg("OO", cuff, "bracelet", 1, BRIEF);
    expect(ref).not.toBeNull();
    expect(ref!.tightShare).toBeNull();
  });
});

// הרשת בייחוס היא אותה רשת שהפרומפט מבקש. כשהיא לא הייתה, טבעת ברשת 2x2 קיבלה
// ייחוס עם שתי שורות בלבד — ולשני פריטים לא היה מה להעתיק.
describe("the reference grid follows the plan", () => {
  const cellsIn = (svg: string) => (svg.match(/<rect [^>]*mask="url\(#lt/g) ?? []).length;

  it("draws one lettered strip per piece the model is asked for", async () => {
    const one = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF, 1);
    const grid = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF, 2);
    expect(cellsIn(one!.svg)).toBe(2);
    expect(cellsIn(grid!.svg)).toBe(4);
    expect(grid!.rows).toHaveLength(4);
  });

  it("puts the strips in columns, not all across the image", async () => {
    const grid = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF, 2);
    const xs = [...grid!.svg.matchAll(/translate\((-?[\d.]+) (-?[\d.]+)\)/g)].map((m) => [
      Number(m[1]), Number(m[2]),
    ]);
    // שני x שונים ושני y שונים — כלומר רשת ולא ערימה.
    expect(new Set(xs.map((p) => p[0])).size).toBe(2);
    expect(new Set(xs.map((p) => p[1])).size).toBe(2);
  });

  it("repeats the faces that fit rather than leaving a piece with nothing to copy", async () => {
    // טקסט ארוך על טבעת: נכנס בפחות פנים ממספר התאים, וכולם עדיין מאוישים.
    const grid = await buildLetteringRenderSvg("Wonderfully", RING, "ring", 3, BRIEF, 2);
    expect(grid).not.toBeNull();
    expect(cellsIn(grid!.svg)).toBe(6);
  });
});
