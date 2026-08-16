import { describe, it, expect } from "vitest";
import { sortDesigns } from "../sortDesigns";
import type { SavedDesign } from "@/lib/client/myDesigns";

// עיצוב מינימלי לצורך המיון — שאר השדות אינם משתתפים בו.
const mk = (over: Partial<SavedDesign>): SavedDesign => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  name: "עיצוב",
  product: "bracelet",
  circMm: 170,
  widthMm: 18,
  cuts: 0,
  updatedAt: "2026-08-01T00:00:00Z",
  ...over,
});

describe("מיון העיצובים בדף /designs", () => {
  const a = mk({ id: "a", serial: 3, product: "ring", updatedAt: "2026-08-10T00:00:00Z" });
  const b = mk({ id: "b", serial: 1, product: "bracelet", updatedAt: "2026-08-12T00:00:00Z" });
  const c = mk({ id: "c", serial: 2, product: "bracelet", updatedAt: "2026-08-11T00:00:00Z" });
  const noSerial = mk({ id: "d", serial: undefined, product: "ring", updatedAt: "2026-08-15T00:00:00Z" });

  it("השתנה לאחרונה — החדש ראשון", () => {
    expect(sortDesigns([a, b, c, noSerial], "updated").map((x) => x.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("מספר עיצוב — עולה, ובלי מספר בסוף ולא נעלם", () => {
    // מי שממיין לפי מספר מחפש עיצוב שהוא יודע את מספרו — AP-0001 ראשון.
    expect(sortDesigns([a, noSerial, b, c], "serial").map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("פריט — צמידים לפני טבעות, ובתוך קבוצה החדש ראשון", () => {
    // אותו סדר שבו המשפך מציג את המוצרים.
    expect(sortDesigns([a, b, c, noSerial], "product").map((x) => x.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("לא נוגע ברשימה המקורית — היא state של הרכיב", () => {
    const input = [a, b, c];
    sortDesigns(input, "serial");
    expect(input.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
