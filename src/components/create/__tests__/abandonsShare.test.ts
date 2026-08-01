import { describe, expect, it } from "vitest";
import { INITIAL, abandonsShare, type CreateState } from "../model";

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
