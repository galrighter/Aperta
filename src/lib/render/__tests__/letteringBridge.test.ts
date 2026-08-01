import { describe, expect, it } from "vitest";
import { buildLetteringRenderSvg } from "../letteringImage";
import { FAB } from "@/lib/fabrication.config";

// הכיתוב נחתך מהפונט אצלנו, ולכן גשר צר מהמינימום לייצור הוא משהו שאנחנו
// יודעים לפני שהמודל צייר משהו. הלקוחה צריכה לדעת עליו.

const RING = { lengthMm: 61.4, widthMm: 12, thicknessMm: 1.5 };
const BRIEF = "טבעת בסגנון אדריכלי";

describe("lettering bridges", () => {
  it("reports the counter a ring's lettering could not hold a bridge in", async () => {
    // אות בגובה 6 מ"מ על טבעת: החלל של e הוא 0.85 מ"מ, קטן מהמינימום לאות.
    const ref = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF);
    expect(ref).not.toBeNull();
    expect(ref!.tightCounterMm).not.toBeNull();
    expect(ref!.tightCounterMm!).toBeLessThan(FAB.minLetterBridgeMm);
    expect(ref!.tightCounterMm!).toBeGreaterThan(0);
    // הדיווח הוא הקונטור הקטן ביותר מכל השורות שהוצעו, ולא של הראשונה בלבד.
    const perRow = ref!.rows.map((r) => r.tightCounterMm).filter((v): v is number => v != null);
    expect(ref!.tightCounterMm).toBe(Math.min(...perRow));
  });

  it("stays silent for lettering whose counters hold the letter minimum", async () => {
    // צמיד רחב: אותה מילה נחתכת גדולה בהרבה, ולכל חלל יש מקום לגשר.
    const cuff = { lengthMm: 160, widthMm: 40, thicknessMm: 1.5 };
    const ref = await buildLetteringRenderSvg("OO", cuff, "bracelet", 1, BRIEF);
    expect(ref).not.toBeNull();
    expect(ref!.tightCounterMm).toBeNull();
  });
});
