import { describe, expect, it } from "vitest";
import { priceFor, PACKAGING, SHIPPING, TAX_RATE } from "../pricing";
import { FAB } from "../fabrication.config";

// התמחור עבר מהדפדפן ל-lib משותף כדי שהשרת יחשב את המחיר שנשמר בהזמנה.
// המבחן הראשון הוא שהמעבר לא שינה אף מספר: מחיר שזז בשקט הוא מחיר שגובים
// אחרת ממה שהוצג.

const OLD_FORMULA = (productType: "bracelet" | "ring", widthMm: number, complexity: number) => {
  const ring = productType === "ring";
  const base = ring ? 240 : 320;
  const perMm = ring ? 14 : 5;
  const def = ring ? 6 : 18;
  const widthAdd = Math.round(Math.max(0, widthMm - def) * perMm);
  const subtotal = base + widthAdd + complexity;
  const tax = Math.round((subtotal + PACKAGING + SHIPPING) * 0.17);
  return subtotal + PACKAGING + SHIPPING + tax;
};

const COMPLEXITY = { low: 0, medium: 45, high: 110 } as const;

describe("תמחור", () => {
  it("מחזיר בדיוק את המחירים של הנוסחה שהייתה במסך", () => {
    for (const productType of ["bracelet", "ring"] as const) {
      for (const density of ["low", "medium", "high"] as const) {
        for (const widthMm of [4, 6, 12, 18, 25, 40, 80]) {
          expect(priceFor({ productType, widthMm, density }).total).toBe(
            OLD_FORMULA(productType, widthMm, COMPLEXITY[density]),
          );
        }
      }
    }
  });

  it("אינו גובה תוספת רוחב מתחת לברירת המחדל של המוצר", () => {
    // הבאג המתבקש כאן הוא רוחב שלילי שהופך להנחה.
    const narrow = priceFor({ productType: "bracelet", widthMm: 5, density: "low" });
    const def = priceFor({
      productType: "bracelet",
      widthMm: FAB.products.bracelet.defaultWidthMm,
      density: "low",
    });
    expect(narrow.widthAdd).toBe(0);
    expect(narrow.total).toBe(def.total);
  });

  it("מחשב את המע\"מ על הכול — כולל אריזה ומשלוח", () => {
    const p = priceFor({ productType: "ring", widthMm: 6, density: "medium" });
    const sub = p.base + p.widthAdd + p.complexity + p.packaging + p.shipping;
    expect(p.tax).toBe(Math.round(sub * TAX_RATE));
    expect(p.total).toBe(sub + p.tax);
  });

  it("גוזר את רוחב הבסיס מ-fabrication.config ולא ממספר שנכתב שוב", () => {
    // אם מישהו ישנה שם את ברירת המחדל, התמחור חייב לזוז איתה.
    const w = FAB.products.ring.defaultWidthMm;
    expect(priceFor({ productType: "ring", widthMm: w, density: "low" }).widthAdd).toBe(0);
    expect(priceFor({ productType: "ring", widthMm: w + 1, density: "low" }).widthAdd).toBe(14);
  });
});
