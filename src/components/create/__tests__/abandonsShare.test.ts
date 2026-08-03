import { describe, expect, it } from "vitest";
import {
  INITIAL, abandonsShare, switchProduct, sizeReallyChanged, invalidateDesign,
  type CreateState, type EditEntry,
} from "../model";

// מי שהגיע מ"להזמין כזה" נוחת על מסך המידות, וסרגל השלבים מאפשר לו לחזור
// למסך המוצר. מה שנבדק כאן הוא מתי החזרה הזו מבטלת את ההזמנה של העיצוב ששותף.

const state = (over: Partial<CreateState> = {}): CreateState => ({ ...INITIAL, ...over });

describe("abandonsShare", () => {
  it("abandons when a different product is picked", () => {
    const s = state({ fromShare: "abcdefghijkm", product: "bracelet" });
    expect(abandonsShare(s, "ring")).toBe(true);
  });

  it("keeps the share when the same product is picked again", () => {
    // חזרה למסך המוצר ובחירה חוזרת באותו דבר אינה ויתור — שום דבר לא השתנה.
    const s = state({ fromShare: "abcdefghijkm", product: "bracelet" });
    expect(abandonsShare(s, "bracelet")).toBe(false);
  });

  it("has nothing to abandon in an ordinary journey", () => {
    expect(abandonsShare(state({ product: "bracelet" }), "ring")).toBe(false);
    expect(abandonsShare(INITIAL, "ring")).toBe(false);
  });

  it("does not abandon before a product was ever chosen", () => {
    // `fromShare` נקבע יחד עם המוצר, אבל אם משום מה עוד אין מוצר — הבחירה
    // הראשונה היא השלמה ולא החלפה.
    const s = state({ fromShare: "abcdefghijkm", product: null });
    expect(abandonsShare(s, "ring")).toBe(false);
  });
});

describe("switchProduct", () => {
  const entry = (): EditEntry =>
    ({ versionId: "v1", svg: "<svg/>" }) as unknown as EditEntry;

  it("clears the existing design when switching to a different product", () => {
    // הבאג: צמיד שנוצר, מעבר לטבעת, וההזמנה יוצאת עם versionId של הצמיד.
    const s = state({ product: "bracelet", designId: "d1", designSerial: 42, edits: [entry()], activeEdit: 0 });
    const patch = switchProduct(s, "ring");
    expect(patch.product).toBe("ring");
    expect(patch.designId).toBeNull();
    expect(patch.edits).toEqual([]);
    expect(patch.activeEdit).toBe(-1);
  });

  it("keeps the design when re-picking the same product", () => {
    const s = state({ product: "bracelet", designId: "d1", edits: [entry()], activeEdit: 0 });
    const patch = switchProduct(s, "bracelet");
    expect(patch).not.toHaveProperty("designId");
    expect(patch.product).toBe("bracelet");
  });

  it("only sets the product when nothing was generated yet", () => {
    const patch = switchProduct(state({ product: "bracelet" }), "ring");
    expect(patch).toEqual({ product: "ring" });
  });

  it("still abandons a shared design on product switch", () => {
    const s = state({ fromShare: "abcdefghijkm", product: "bracelet", designId: "d1", edits: [entry()], activeEdit: 0 });
    const patch = switchProduct(s, "ring");
    expect(patch.fromShare).toBeNull();
    expect(patch.designId).toBeNull();
  });
});

describe("sizeReallyChanged", () => {
  it("is true only when a size field takes a new value", () => {
    const s = state({ circ: "170", braceletWidth: 18 });
    expect(sizeReallyChanged(s, { circ: "190" })).toBe(true);
    expect(sizeReallyChanged(s, { braceletWidth: 20 })).toBe(true);
  });

  it("is false when the size field is set to the same value", () => {
    // בחירה חוזרת באותה מידה אינה שינוי — אסור שתבטל עיצוב קיים.
    const s = state({ circ: "170" });
    expect(sizeReallyChanged(s, { circ: "170" })).toBe(false);
  });

  it("ignores non-size fields like the measure-guide toggle", () => {
    expect(sizeReallyChanged(state(), { guideOpen: true })).toBe(false);
  });
});

describe("invalidateDesign", () => {
  it("clears the engine output but not the customer's intent", () => {
    const patch = invalidateDesign();
    expect(patch.designId).toBeNull();
    expect(patch.edits).toEqual([]);
    expect(patch.activeEdit).toBe(-1);
    // הבריף/כיתוב/תמונות אינם חלק מהאיפוס.
    expect(patch).not.toHaveProperty("brief");
    expect(patch).not.toHaveProperty("lettering");
  });
});
