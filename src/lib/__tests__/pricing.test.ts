import { describe, expect, it } from "vitest";
import { priceFor, SHIPPING, TAX_RATE, vatIn } from "../pricing";
import { FAB } from "../fabrication.config";

// המחירון (29.7, החלטת גל): צמיד סטנדרטי ₪399, טבעת ₪299 — **כולל מע"מ**,
// לפני משלוח. המע"מ 18% ונגזר מתוך הסכום ולא מתווסף אליו.
//
// הטסטים כאן נועלים בדיוק את שני המספרים שגל אמר, ואת המבנה שנגזר מהם: מה
// שכתוב הוא מה שמשלמים. הכשל שהם מונעים הוא חזרה שקטה למודל הקודם — 17%
// שנוספים מעל — שמזיז כל מחיר באתר ב-18% בלי ששורה אחת נראית שגויה.

const STD_BRACELET = { productType: "bracelet", widthMm: 18, density: "medium" } as const;
const STD_RING = { productType: "ring", widthMm: 6, density: "medium" } as const;

describe("מחירון", () => {
  it("צמיד סטנדרטי הוא ₪399 לפני משלוח, וטבעת ₪299", () => {
    expect(priceFor(STD_BRACELET).base).toBe(399);
    expect(priceFor(STD_RING).base).toBe(299);
  });

  it("המשלוח מתווסף לבסיס, והמע\"מ לא", () => {
    // הבאג שהטסט הזה שומר מפניו: חזרה למודל שמכפיל את הסכום ב-1.18.
    expect(priceFor(STD_BRACELET).total).toBe(399 + SHIPPING);
    expect(priceFor(STD_RING).total).toBe(299 + SHIPPING);
  });

  it("המע\"מ הוא החלק הכלול בסכום (18/118), לא תוספת מעליו", () => {
    const p = priceFor(STD_BRACELET);
    expect(p.vat).toBe(Math.round((p.total * TAX_RATE) / (1 + TAX_RATE)));
    expect(p.vat).toBe(vatIn(p.total));
    // 434 → 66, ולא 434*0.18 = 78.
    expect(p.total).toBe(434);
    expect(p.vat).toBe(66);
    // והבדיקה בכיוון ההפוך: הנטו כשמוסיפים לו 18% חוזר לסכום, עד כדי עיגול.
    const net = p.total - p.vat;
    expect(Math.abs(Math.round(net * (1 + TAX_RATE)) - p.total)).toBeLessThanOrEqual(1);
  });

  it("מוסיף על רוחב רק מעל ברירת המחדל של המוצר", () => {
    const def = FAB.products.bracelet.defaultWidthMm;
    expect(priceFor({ productType: "bracelet", widthMm: def, density: "medium" }).widthAdd).toBe(0);
    // הבאג המתבקש כאן הוא רוחב שלילי שהופך להנחה.
    expect(priceFor({ productType: "bracelet", widthMm: 5, density: "medium" }).widthAdd).toBe(0);
    expect(priceFor({ productType: "bracelet", widthMm: def + 10, density: "medium" }).widthAdd).toBe(50);
    expect(priceFor({ productType: "ring", widthMm: 7, density: "medium" }).widthAdd).toBe(14);
  });

  it("המורכבות הסטנדרטית כלולה בבסיס, ולכן היא הפרש ולא סכום", () => {
    expect(priceFor(STD_BRACELET).complexity).toBe(0);
    expect(priceFor({ ...STD_BRACELET, density: "low" }).complexity).toBeLessThan(0);
    expect(priceFor({ ...STD_BRACELET, density: "high" }).complexity).toBeGreaterThan(0);
    // תבנית פשוטה זולה מסטנדרטית, וצפופה יקרה ממנה — בסכום שמשלמים.
    expect(priceFor({ ...STD_BRACELET, density: "low" }).total).toBeLessThan(
      priceFor(STD_BRACELET).total,
    );
    expect(priceFor({ ...STD_BRACELET, density: "high" }).total).toBeGreaterThan(
      priceFor(STD_BRACELET).total,
    );
  });

  it("הסכום הוא בדיוק סכום הרכיבים — המע\"מ אינו אחד מהם", () => {
    for (const productType of ["bracelet", "ring"] as const) {
      for (const density of ["low", "medium", "high"] as const) {
        for (const widthMm of [4, 6, 18, 30, 80]) {
          const p = priceFor({ productType, widthMm, density });
          expect(p.total).toBe(p.base + p.widthAdd + p.complexity + p.shipping);
          expect(p.vat).toBeLessThan(p.total);
        }
      }
    }
  });
});
