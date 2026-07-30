import { describe, it, expect } from "vitest";
import { INITIAL, buildPrompt, densityForPrice, priceOf, type CreateState } from "../model";

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
      expect(buildPrompt(state({ attrsAuto }))).toContain("שנחתך בלייזר מפס מתכת שטוח");
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
