import { describe, expect, it } from "vitest";
import { priceFor, referralBase, SHIPPING, vatIn, type ReferralRule } from "../pricing";
import { normalizeCode, ruleOf, type ReferralCodeRow } from "../db/referralCodes";

// תמחור לפי קוד הפניה (0026). כל מה שנבדק כאן הוא הפונקציות הטהורות — הן
// אלה שקובעות כמה כסף נגבה, והמסלול רק קורא להן.

const FIXED: ReferralRule = { kind: "fixed_price", basePrices: { bracelet: 180, ring: 140 } };

describe("מחיר לפי קוד הפניה", () => {
  it("הקוד קובע את מחיר הפריט, והמשלוח נשאר", () => {
    // המשלוח הוא עלות אמיתית שיוצאת מהכיס. קוד שמבטל אותה הופך כל הזמנה
    // להפסד ישיר, ולכן הוא חל על הפריט בלבד.
    const p = priceFor({ productType: "bracelet", referral: { code: "FF-25", rule: FIXED } });
    expect(p.base).toBe(180);
    expect(p.shipping).toBe(SHIPPING);
    expect(p.total).toBe(180 + SHIPPING);
  });

  it("המע״מ נגזר מהסכום שנגבה בפועל, לא מהמחירון", () => {
    const p = priceFor({ productType: "bracelet", referral: { code: "FF-25", rule: FIXED } });
    expect(p.vat).toBe(vatIn(p.total));
    // ‏66 הוא המע"מ של הזמנה מלאה (434). מספר שנשאר תקוע עליו פירושו חשבונית
    // שמדווחת מע"מ על כסף שלא התקבל.
    expect(p.vat).toBeLessThan(vatIn(399 + SHIPPING));
  });

  it("כל מוצר מקבל את המחיר שלו", () => {
    const ring = priceFor({ productType: "ring", referral: { code: "FF-25", rule: FIXED } });
    expect(ring.base).toBe(140);
  });

  it("בלי קוד — המחירון, ובלי השדות של ההפניה", () => {
    const p = priceFor({ productType: "bracelet" });
    expect(p.base).toBe(399);
    // הזמנה רגילה נשמרת בדיוק כפי שנשמרה לפני 0026.
    expect(p.referralCode).toBeUndefined();
    expect(p.listBase).toBeUndefined();
  });

  it("שומר את הקוד ואת המחירון על ההזמנה", () => {
    // ‏`listBase` הוא מה שמאפשר לענות בדיעבד "כמה ויתרנו", בלי לשחזר מחירון
    // שהשתנה מאז. הוא לא מוצג ללקוחה בשום מסך.
    const p = priceFor({ productType: "bracelet", referral: { code: "FF-25", rule: FIXED } });
    expect(p.referralCode).toBe("FF-25");
    expect(p.listBase).toBe(399);
  });

  it("אחוז מחושב מהמחירון ומעוגל", () => {
    // הכלל הזה עוד לא בשימוש, אבל הוא במסד — ומחיר שמחושב לא נכון בפעם
    // הראשונה שמשתמשים בו הוא כסף אמיתי.
    const p = priceFor({
      productType: "bracelet",
      referral: { code: "SHOP-1", rule: { kind: "percent_off", percentOff: 20 } },
    });
    expect(p.base).toBe(319); // 399 × 0.8 = 319.2
    expect(Number.isInteger(p.total)).toBe(true);
  });

  it("לא יורד מתחת לאפס", () => {
    // מחיר שלילי היה מייצר הזמנה שגובה פחות מעלות המשלוח ששולמה כבר.
    const base = referralBase({ kind: "fixed_price", basePrices: { bracelet: -50, ring: 0 } }, "bracelet");
    expect(base).toBe(0);
  });

  it("מחיר חסר למוצר נופל למחירון ולא ל-NaN", () => {
    // ה-check constraint של 0026 חוסם את זה בכתיבה; כאן נבדק שגם אם שורה
    // פגומה הגיעה איכשהו, ההזמנה לא נשמרת עם `total: NaN`.
    const broken = { kind: "fixed_price", basePrices: {} } as unknown as ReferralRule;
    expect(referralBase(broken, "ring")).toBe(299);
  });
});

describe("FAMILY25 — הקוד של ההשקה", () => {
  // המחירים עצמם נשתלים ב-0027, אבל המספר שהלקוחה משלמת נגזר מהם **כאן**:
  // שינוי ב-SHIPPING או ב-TAX_RATE מזיז אותו בלי שאיש נגע בקוד ההפניה.
  // הבדיקה הזאת היא מה שיגיד שזה קרה.
  const FAMILY: ReferralRule = { kind: "fixed_price", basePrices: { bracelet: 100, ring: 80 } };

  it("צמיד — ₪135 לתשלום", () => {
    const p = priceFor({ productType: "bracelet", referral: { code: "FAMILY25", rule: FAMILY } });
    expect(p.base).toBe(100);
    expect(p.total).toBe(135);
    expect(p.vat).toBe(21);
  });

  it("טבעת — ₪115 לתשלום", () => {
    const p = priceFor({ productType: "ring", referral: { code: "FAMILY25", rule: FAMILY } });
    expect(p.base).toBe(80);
    expect(p.total).toBe(115);
    expect(p.vat).toBe(18);
  });

  it("**איסוף עצמי — אין משלוח**, ולכן ₪100 ו-₪80 הם מה שמשלמים", () => {
    // 0027 מסמן `pickup_only`. בלי זה נגבים ‎₪35 על משלוח שלא יקרה.
    const bracelet = priceFor({
      productType: "bracelet",
      referral: { code: "FAMILY25", rule: FAMILY, pickupOnly: true },
    });
    expect(bracelet.shipping).toBe(0);
    expect(bracelet.total).toBe(100);

    const ring = priceFor({
      productType: "ring",
      referral: { code: "FAMILY25", rule: FAMILY, pickupOnly: true },
    });
    expect(ring.total).toBe(80);
  });

  it("המע״מ יורד יחד עם הסכום שנגבה", () => {
    const p = priceFor({
      productType: "bracelet",
      referral: { code: "FAMILY25", rule: FAMILY, pickupOnly: true },
    });
    expect(p.vat).toBe(vatIn(100));
  });

  it("קוד בלי איסוף עצמי ממשיך לגבות משלוח", () => {
    // `pickupOnly` הוא ציר נפרד מהמחיר: קוד חנות ייתן מחיר מיוחד ויישלח.
    const p = priceFor({ productType: "bracelet", referral: { code: "SHOP-1", rule: FAMILY } });
    expect(p.shipping).toBe(SHIPPING);
  });

  it("הקוד מנורמל לצורה שנשמרה במסד", () => {
    // ‏0027 שומר 'FAMILY25'. כל צורה שנמסרת בעל־פה או בהקלדה חייבת להגיע אליה.
    for (const typed of ["Family25", "family25", " FAMILY25 ", "FAMILY25"]) {
      expect(normalizeCode(typed)).toBe("FAMILY25");
    }
  });
});

describe("נרמול הקוד", () => {
  it("רישיות ורווחים אינם משנים קוד", () => {
    expect(normalizeCode("  ff-25 ")).toBe("FF-25");
    expect(normalizeCode("ff 25")).toBe("FF-25");
  });

  it("מקף טיפוגרפי הוא אותו קוד", () => {
    // קוד שעובר בוואטסאפ חוזר לפעמים עם מקף שאיש לא הקליד. בלי זה הוא נדחה
    // כ"לא נמצא", והלקוחה לא יכולה לראות את ההבדל על המסך.
    expect(normalizeCode("FF–25")).toBe("FF-25");
    expect(normalizeCode("FF־25")).toBe("FF-25");
  });

  it("מקפים כפולים ומקף בקצה נבלעים", () => {
    expect(normalizeCode("-FF--25-")).toBe("FF-25");
  });
});

describe("הכלל שנקרא מהשורה", () => {
  const ROW: ReferralCodeRow = {
    id: "00000000-0000-0000-0000-000000000001",
    code: "FF-25",
    label: "חברים ומשפחה",
    public_label: null,
    kind: "fixed_price",
    base_prices: { bracelet: 180, ring: 140 },
    percent_off: null,
    pickup_only: false,
    max_uses: 25,
    expires_at: null,
    active: true,
    note: null,
    created_at: "2026-08-16T00:00:00.000Z",
    updated_at: "2026-08-16T00:00:00.000Z",
  };

  it("מחיר קבוע", () => {
    expect(ruleOf(ROW)).toEqual(FIXED);
  });

  it("אחוז מומר למספר — numeric חוזר כמחרוזת מ-PostgREST", () => {
    const row = { ...ROW, kind: "percent_off" as const, base_prices: null, percent_off: "20" as unknown as number };
    expect(ruleOf(row)).toEqual({ kind: "percent_off", percentOff: 20 });
  });

  it("שורה בלי הגדרה מחזירה null ולא כלל שמתמחר לבד", () => {
    expect(ruleOf({ ...ROW, base_prices: null })).toBeNull();
    expect(ruleOf({ ...ROW, kind: "percent_off", base_prices: null })).toBeNull();
  });
});
