import { describe, expect, it } from "vitest";
import { buildLetteringRenderSvg } from "../letteringImage";
import { LANDSCAPE } from "../canvas";

// הכיתוב נחתך מהפונט אצלנו, ולכן גשר צר מהמינימום לייצור הוא משהו שאנחנו
// יודעים לפני שהמודל צייר משהו. הלקוחה צריכה לדעת עליו.

const RING = { lengthMm: 61.4, widthMm: 12, thicknessMm: 1.5 };
const BRIEF = "טבעת בסגנון אדריכלי";

describe("lettering bridges", () => {
  it("reports how much of the counter the bridge had to take", async () => {
    // אות בגובה 6 מ"מ על טבעת: החלל של e קטן מכדי להחזיק גשר יחסי, והגשר
    // נשאר על המינימום לאות.
    const ref = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF, 1, LANDSCAPE);
    expect(ref).not.toBeNull();
    expect(ref!.tightShare).not.toBeNull();
    // מעל היחס שהיה נבחר לו היה מקום, ומתחת לחלל כולו.
    expect(ref!.tightShare!).toBeGreaterThan(0.4);
    expect(ref!.tightShare!).toBeLessThan(1);
    // הדיווח הוא הפגיעה הגדולה ביותר מכל השורות שהוצעו, ולא של הראשונה בלבד.
    const perRow = ref!.rows.map((r) => r.tightShare).filter((v): v is number => v != null);
    expect(ref!.tightShare).toBe(Math.max(...perRow));
  });

  // הסף להתראה הוא 50% מהחלל (`LETTERING_BRIDGE_SHARE` ב-/api/generate). מה
  // שקובע אם הוא יושב נכון הוא גאומטריית הפונט, לא המספר, ולכן נמדד מהצינור
  // עצמו ולא מחישוב נפרד: פס 15 מ"מ נותן 46% — הרצפה נגעה, אבל התוצאה היא
  // בערך היחס המתוכנן ואין על מה להתריע. פס 12 מ"מ נותן 59% ו-8 מ"מ נותן 92%,
  // ושם הגשר באמת בולע את החלל.
  //
  // המרווח בין 46% ל-50% צר. אם הפונט או `BRIDGE_COUNTER_RATIO` יזוזו, זה מה
  // שייפול — וזו בדיוק ההתראה שצריך לקבל לפני שהלקוחה מקבלת אותה.
  it("keeps lettering that got roughly the bridge it wanted under the warning line", async () => {
    const wide = { lengthMm: 61.4, widthMm: 15, thicknessMm: 1.5 };
    const ref = await buildLetteringRenderSvg("RMJewel", wide, "ring", 2, BRIEF, 1, LANDSCAPE);
    expect(ref!.tightShare!).toBeLessThan(0.5);
  });

  it("crosses it when the counter is small enough that the bridge eats it", async () => {
    const narrow = { lengthMm: 61.4, widthMm: 8, thicknessMm: 1.5 };
    const ref = await buildLetteringRenderSvg("RMJewel", narrow, "ring", 2, BRIEF, 1, LANDSCAPE);
    expect(ref!.tightShare!).toBeGreaterThanOrEqual(0.5);
  });

  it("stays silent for lettering whose counters hold a proportional bridge", async () => {
    // צמיד רחב: אותה מילה נחתכת גדולה בהרבה, ולכל חלל יש מקום לגשר.
    const cuff = { lengthMm: 160, widthMm: 40, thicknessMm: 1.5 };
    const ref = await buildLetteringRenderSvg("OO", cuff, "bracelet", 1, BRIEF, 1, LANDSCAPE);
    expect(ref).not.toBeNull();
    expect(ref!.tightShare).toBeNull();
  });
});

// הרשת בייחוס היא אותה רשת שהפרומפט מבקש. כשהיא לא הייתה, טבעת ברשת 2x2 קיבלה
// ייחוס עם שתי שורות בלבד — ולשני פריטים לא היה מה להעתיק.
describe("the reference grid follows the plan", () => {
  const cellsIn = (svg: string) => (svg.match(/<rect [^>]*mask="url\(#lt/g) ?? []).length;

  it("draws one lettered strip per piece the model is asked for", async () => {
    const one = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF, 1, LANDSCAPE);
    const grid = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF, 2, LANDSCAPE);
    expect(cellsIn(one!.svg)).toBe(2);
    expect(cellsIn(grid!.svg)).toBe(4);
    expect(grid!.rows).toHaveLength(4);
  });

  it("puts the strips in columns, not all across the image", async () => {
    const grid = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF, 2, LANDSCAPE);
    const xs = [...grid!.svg.matchAll(/translate\((-?[\d.]+) (-?[\d.]+)\)/g)].map((m) => [
      Number(m[1]), Number(m[2]),
    ]);
    // שני x שונים ושני y שונים — כלומר רשת ולא ערימה.
    expect(new Set(xs.map((p) => p[0])).size).toBe(2);
    expect(new Set(xs.map((p) => p[1])).size).toBe(2);
  });

  it("repeats the faces that fit rather than leaving a piece with nothing to copy", async () => {
    // טקסט ארוך על טבעת: נכנס בפחות פנים ממספר התאים, וכולם עדיין מאוישים.
    const grid = await buildLetteringRenderSvg("Wonderfully", RING, "ring", 3, BRIEF, 2, LANDSCAPE);
    expect(grid).not.toBeNull();
    expect(cellsIn(grid!.svg)).toBe(6);
  });
});
