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
