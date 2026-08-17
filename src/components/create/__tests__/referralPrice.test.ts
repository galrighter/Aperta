import { describe, expect, it } from "vitest";
import { INITIAL, priceOf, type AppliedReferral, type CreateState } from "../model";
import { priceFor } from "@/lib/pricing";

// המחיר שעל המסך כשיש קוד הפניה (0026).

const applied = (productType: "bracelet" | "ring", pickup = false): AppliedReferral => ({
  code: "FF-25",
  label: null,
  productType,
  pickup,
  price: priceFor({
    productType,
    referral: { code: "FF-25", rule: { kind: "fixed_price", basePrices: { bracelet: 180, ring: 140 } } },
  }),
});

const state = (patch: Partial<CreateState>): CreateState => ({ ...INITIAL, ...patch });

describe("priceOf עם קוד הפניה", () => {
  it("מציג את המחיר שהשרת החזיר", () => {
    const s = state({ product: "bracelet", referral: applied("bracelet") });
    expect(priceOf(s).base).toBe(180);
  });

  it("**מתעלם מקוד שנבדק מול מוצר אחר**", () => {
    // המסלול: הקוד אומת על צמיד, הלקוחה חזרה אחורה והחליפה לטבעת. המחיר
    // השמור שייך לצמיד, והצגתו כאן הייתה מראה סכום שאיש לא אישר לטבעת —
    // ואז השרת היה דוחה את ההזמנה ב-`price_changed` בשליחה עצמה.
    const s = state({ product: "ring", referral: applied("bracelet") });
    expect(priceOf(s).base).toBe(299);
  });

  it("איסוף עצמי אינו נדבק לקוד של מוצר אחר", () => {
    // אותה נפילה לאחור כמו במחיר: קוד שנבדק על צמיד לא הופך הזמנת טבעת
    // להזמנה בלי משלוח.
    const s = state({ product: "ring", referral: applied("bracelet", true) });
    expect(priceOf(s).shipping).toBeGreaterThan(0);
  });

  it("בלי קוד — המחירון", () => {
    expect(priceOf(state({ product: "bracelet" })).base).toBe(399);
  });

  it("הסרת הקוד מחזירה את המחיר למחירון מיד", () => {
    const withCode = state({ product: "bracelet", referral: applied("bracelet") });
    expect(priceOf({ ...withCode, referral: null }).total).toBe(priceOf(state({ product: "bracelet" })).total);
  });
});
