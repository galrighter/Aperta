import { describe, expect, it } from "vitest";
import { priceFor, SHIPPING, TAX_RATE, vatIn } from "../pricing";

// המחירון (29.7, החלטת גל): צמיד סטנדרטי ₪399, טבעת ₪299 — **כולל מע"מ**,
// לפני משלוח. המע"מ 18% ונגזר מתוך הסכום ולא מתווסף אליו.
//
// הטסטים כאן נועלים בדיוק את שני המספרים שגל אמר, ואת המבנה שנגזר מהם: מה
// שכתוב הוא מה שמשלמים. הכשל שהם מונעים הוא חזרה שקטה למודל הקודם — 17%
// שנוספים מעל — שמזיז כל מחיר באתר ב-18% בלי ששורה אחת נראית שגויה.
//
// ומאז המחיר הקבוע (החלטת גל): הקלט היחיד הוא **מה** מייצרים. שתי התוספות
// המשתנות — רוחב ומורכבות — הוסרו משני המסלולים, וזה מה שהקבוצה השנייה כאן
// שומרת עליו. הן לא הוחלפו במקדם אחר; הן פשוט אינן.

const BRACELET = { productType: "bracelet" } as const;
const RING = { productType: "ring" } as const;

describe("מחירון", () => {
  it("צמיד הוא ₪399 לפני משלוח, וטבעת ₪299", () => {
    expect(priceFor(BRACELET).base).toBe(399);
    expect(priceFor(RING).base).toBe(299);
  });

  it("המשלוח מתווסף לבסיס, והמע\"מ לא", () => {
    // הבאג שהטסט הזה שומר מפניו: חזרה למודל שמכפיל את הסכום ב-1.18.
    expect(priceFor(BRACELET).total).toBe(399 + SHIPPING);
    expect(priceFor(RING).total).toBe(299 + SHIPPING);
  });

  it("המע\"מ הוא החלק הכלול בסכום (18/118), לא תוספת מעליו", () => {
    const p = priceFor(BRACELET);
    expect(p.vat).toBe(Math.round((p.total * TAX_RATE) / (1 + TAX_RATE)));
    expect(p.vat).toBe(vatIn(p.total));
    // 434 → 66, ולא 434*0.18 = 78.
    expect(p.total).toBe(434);
    expect(p.vat).toBe(66);
    // והבדיקה בכיוון ההפוך: הנטו כשמוסיפים לו 18% חוזר לסכום, עד כדי עיגול.
    const net = p.total - p.vat;
    expect(Math.abs(Math.round(net * (1 + TAX_RATE)) - p.total)).toBeLessThanOrEqual(1);
  });
});

describe("המחיר קבוע למוצר", () => {
  it("הקלט היחיד הוא המוצר — אין רכיב שני שיכול להזיז את הסכום", () => {
    // הטענה במלואה: שתי קריאות לאותו מוצר מחזירות אובייקט זהה, תמיד.
    expect(priceFor(BRACELET)).toEqual(priceFor(BRACELET));
    expect(priceFor(RING)).toEqual(priceFor(RING));
    expect(priceFor(BRACELET).total).not.toBe(priceFor(RING).total);
  });

  it("הסכום הוא בדיוק בסיס + משלוח, והמע\"מ אינו רכיב", () => {
    for (const productType of ["bracelet", "ring"] as const) {
      const p = priceFor({ productType });
      expect(p.total).toBe(p.base + p.shipping);
      expect(p.vat).toBeLessThan(p.total);
    }
  });

  it("אין יותר תוספת רוחב ואין תוספת מורכבות במחיר שמחושב", () => {
    // הן נשארו בטיפוס בשביל הזמנות שכבר נשלחו ונשמרו איתן (`Price` ב-pricing.ts),
    // ואסור שהן יחזרו למה שמחושב עכשיו: שם הן היו הפער בין המחיר שהובטח בכרטיס
    // המוצר לבין המספר שהתגלה בסוף המסע.
    for (const productType of ["bracelet", "ring"] as const) {
      const p = priceFor({ productType });
      expect(p.widthAdd).toBeUndefined();
      expect(p.complexity).toBeUndefined();
    }
  });
});
