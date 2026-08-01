import { describe, expect, it } from "vitest";
import { buildLetteringRenderSvg } from "../letteringImage";
import { resolveFab } from "@/lib/fabrication.config";

// הכיתוב נחתך מהפונט אצלנו, ולכן גשר צר מהמינימום לייצור הוא משהו שאנחנו
// יודעים לפני שהמודל צייר משהו. הלקוחה צריכה לדעת עליו.

const RING = { lengthMm: 61.4, widthMm: 12, thicknessMm: 1.5 };
const BRIEF = "טבעת בסגנון אדריכלי";

describe("lettering bridges", () => {
  it("reports the narrowest bridge a ring's lettering needed", async () => {
    // אות בגובה 6 מ"מ על טבעת: הקונטור של e קטן מכדי להחזיק גשר ברוחב מלא.
    const ref = await buildLetteringRenderSvg("RMJewel", RING, "ring", 2, BRIEF);
    expect(ref).not.toBeNull();
    const { minBridgeCut } = resolveFab(RING.thicknessMm, "ring");
    expect(ref!.narrowBridgeMm).not.toBeNull();
    expect(ref!.narrowBridgeMm!).toBeLessThan(minBridgeCut);
    expect(ref!.narrowBridgeMm!).toBeGreaterThan(0);
    // הדיווח הוא הצר ביותר מכל השורות שהוצעו, ולא של הראשונה בלבד.
    const perRow = ref!.rows.map((r) => r.narrowBridgeMm).filter((v): v is number => v != null);
    expect(ref!.narrowBridgeMm).toBe(Math.min(...perRow));
  });

  it("stays silent for lettering whose counters hold a full bridge", async () => {
    // צמיד רחב: אותה מילה נחתכת גדולה בהרבה, והגשרים יוצאים במינימום המלא.
    const cuff = { lengthMm: 160, widthMm: 40, thicknessMm: 1.5 };
    const ref = await buildLetteringRenderSvg("OO", cuff, "bracelet", 1, BRIEF);
    expect(ref).not.toBeNull();
    expect(ref!.narrowBridgeMm).toBeNull();
  });
});
