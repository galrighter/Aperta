import { describe, it, expect } from "vitest";
import { INITIAL, buildPrompt, canGenerate, densityForPrice, priceOf, type CreateState } from "../model";

// "שהמודל יחליט" — האפשרות לא לבחור מאפיינים. הבדיקה כאן היא על מה שיוצא
// לפרומפט ועל מה שקורה לתמחור, כי אלה שני המקומות שהדגל נוגע בהם.

const state = (patch: Partial<CreateState>): CreateState => ({
  ...INITIAL,
  product: "bracelet",
  ...patch,
});

describe("buildPrompt — מאפיינים", () => {
  it("שולח את שלושת המאפיינים כשנבחרו", () => {
    const p = buildPrompt(state({ symmetry: "asymmetric", density: "high", feel: "delicate" }));
    expect(p).toContain("א-סימטרי");
    expect(p).toContain("צפיפות גבוהה");
    expect(p).toContain("תחושה עדינה");
  });

  it("לא שולח אף מאפיין כשהמודל מחליט — גם לא את ברירות המחדל", () => {
    // זה הלב: ברירות המחדל *הן* הוראה. "סימטרי, צפיפות בינונית, מאוזן" נשלח
    // עד עכשיו בכל יצירה, וסתר תיאור חופשי שביקש משהו אחר.
    const p = buildPrompt(state({ attrsAuto: true, brief: "עלים מחוברים" }));
    expect(p).not.toContain("סימטרי");
    expect(p).not.toContain("צפיפות");
    expect(p).not.toContain("תחושה");
    // התיאור של הלקוחה כן נשאר — הוא כל מה שיש למודל לעבוד לפיו.
    expect(p).toContain("תיאור הלקוחה: עלים מחוברים");
  });

  it("שומר על תיאור הפריט עצמו בשני המצבים", () => {
    for (const attrsAuto of [false, true]) {
      // "פח" ולא "פס": חומר הגלם, לא צורה. ראה את ההערה ב-buildPrompt.
      expect(buildPrompt(state({ attrsAuto }))).toContain("שנחתך בלייזר מפח מתכת שטוח");
    }
  });
});

describe("תמחור כשלא נבחרה צפיפות", () => {
  it("נופל לבינונית, ולא לצפיפות שנשארה במסך", () => {
    expect(densityForPrice(state({ attrsAuto: true, density: "high" }))).toBe("medium");
    expect(densityForPrice(state({ attrsAuto: false, density: "high" }))).toBe("high");
  });

  it("המחיר ב״שהמודל יחליט״ שווה למחיר של צפיפות בינונית", () => {
    const auto = priceOf(state({ attrsAuto: true, density: "high" }));
    const medium = priceOf(state({ attrsAuto: false, density: "medium" }));
    expect(auto.total).toBe(medium.total);
  });
});

describe("מתי בכלל יש ממה לייצר", () => {
  // AP-0074: הבקשה הגיעה לשרת בלי תיאור ובלי תמונה, עם ברירות המחדל בלבד,
  // והלקוחה קיבלה אחרי המתנה עיצוב שלא ביקשה — והוא נספר במכסה שלה. הכפתור
  // חסם את זה תמיד; ההרצה שממשיכה אחרי כניסה לחשבון לא עברה בכפתור מעולם.
  it("טופס ריק אינו נשלח", () => {
    expect(canGenerate(state({}))).toBe(false);
  });

  it("תיאור, כיתוב או תמונה — כל אחד מהם מספיק", () => {
    expect(canGenerate(state({ brief: "קווים דקים" }))).toBe(true);
    expect(canGenerate(state({ lettering: "ענבל" }))).toBe(true);
    expect(canGenerate(state({ image: { dataUrl: "data:image/png;base64,AA", name: "a.png" } }))).toBe(true);
  });

  it("קובץ מוכן לחיתוך אינו דורש תיאור", () => {
    expect(canGenerate(state({ imageRole: "ready" }))).toBe(true);
  });
});
