import { describe, expect, it } from "vitest";
import { inputChips } from "@/components/admin/RunsLog";

/**
 * dialogue mode — הסימון ביומן.
 *
 * **למה זה נבדק.** ‏`mode` נשמר על ההרצה מאז #285, אבל היומן צייר תגית רק
 * ל-`story` — כלומר הרצה של המסלול החדש נראתה שם **זהה לעריכה רגילה**. זו
 * בדיוק ההשוואה שהניסוי קיים בשבילה, והכשל שקט: אין שגיאה, יש רק דוח שאי
 * אפשר לפרק לשני מסלולים.
 *
 * הבדיקה היא על הפונקציה הטהורה שבונה את התגיות — לא על הרינדור.
 */

const chipsOf = inputChips;

describe("inputChips — סימון המסלול", () => {
  it("dialogue מקבל תגית משלו", () => {
    expect(chipsOf({ mode: "dialogue" })).toContain("מסלול השיחה");
  });

  it("story נשאר כפי שהיה", () => {
    const chips = chipsOf({ mode: "story" });
    expect(chips).toContain("מסלול הסיפור");
    expect(chips).not.toContain("מסלול השיחה");
  });

  it("המסלול הרגיל — בלי שום תגית מסלול", () => {
    const chips = chipsOf({ editedFromCurrent: true });
    expect(chips).not.toContain("מסלול השיחה");
    expect(chips).not.toContain("מסלול הסיפור");
    // ומה שכן היה שם קודם ממשיך להיות שם.
    expect(chips).toContain("עריכה של הקיים");
  });
});

describe("inputChips — שלב העריכה", () => {
  const usage = { inputTokens: 900, outputTokens: 1400, totalTokens: 2300, reasoningTokens: 700 };

  it("מה שהשלב עלה, כולל טוקני חשיבה", () => {
    const chips = chipsOf({ mode: "dialogue", editStage: { ok: true, usage } });
    expect(chips.some((c) => c.includes("שלב העריכה") && c.includes("חשיבה"))).toBe(true);
  });

  it("נפילה־לאחור מסומנת — היא ההתנהגות המתוכננת, לא שגיאה", () => {
    // בלי התגית הזו ההרצה נראית כמו עריכה דו־שלבית שיצאה גרוע, והמדידה של
    // A0 הייתה סופרת אותה ככזו.
    const chips = chipsOf({ mode: "dialogue", editStage: { ok: false, attempts: 2 } });
    expect(chips.some((c) => c.includes("שלב העריכה נפל") && c.includes("2"))).toBe(true);
  });

  it("הצליח בניסיון שני — נספר, כי זה ספק שמתחיל להתקלקל", () => {
    const chips = chipsOf({ mode: "dialogue", editStage: { ok: true, attempts: 2 } });
    expect(chips).toContain("שלב העריכה: 2 ניסיונות");
  });

  it("הצליח בראשון — בלי רעש", () => {
    const chips = chipsOf({ mode: "dialogue", editStage: { ok: true, attempts: 1 } });
    expect(chips.some((c) => c.includes("ניסיונות"))).toBe(false);
  });

  it("בקשת הבהרה נספרת — זה המספר שיצדיק את שלב B", () => {
    const chips = chipsOf({ mode: "dialogue", editStage: { ok: true, clarification: "איזה צד?" } });
    expect(chips).toContain("שלב העריכה ביקש הבהרה");
  });

  it("המפרט המצטבר נמדד בשדות שמלאים — מתוך הסכמה המורחבת", () => {
    // אפס פירושו סבב בלי הקשר — בדיוק מה שההזרעה והשרשרת באו למנוע.
    expect(chipsOf({ editSpec: {} })).toContain("מפרט מצטבר 0/10");
    expect(chipsOf({ editSpec: { outer_silhouette: "a band", metal_structure: "  " } }))
      .toContain("מפרט מצטבר 1/10");
  });

  it("היחס ו-`sources` אינם נספרים — הם אינם שדות שמציירים מהם", () => {
    expect(chipsOf({
      editSpec: { outer_silhouette: "a band", length_to_width_ratio: 7, sources: { outer_silhouette: "user" } },
    })).toContain("מפרט מצטבר 1/10");
  });

  it("‏respec מסומן — בלעדיו עריכת respec ועריכת ייחוס נראות זהות", () => {
    const chips = chipsOf({ mode: "dialogue", editStage: { ok: true, respec: true, strategy: "respec" } });
    expect(chips.some((c) => c.includes("respec") && c.includes("מהמפרט"))).toBe(true);
  });

  it("‏respec שהוצהר וירד לייחוס — הפער נראה, כי הוא הנתון", () => {
    const down = chipsOf({ mode: "dialogue", editStage: { ok: true, strategy: "respec" } });
    expect(down).toContain("⚠ respec הוצהר וירד לעריכת ייחוס");
    // וכשההצהרה כובדה — תגית ה-respec לבדה, בלי אזהרה.
    const honoured = chipsOf({ mode: "dialogue", editStage: { ok: true, strategy: "respec", respec: true } });
    expect(honoured.some((c) => c.includes("הוצהר וירד"))).toBe(false);
  });

  it("הכרעה שאינה ברירת המחדל — clarify — נראית", () => {
    const chips = chipsOf({ mode: "dialogue", editStage: { ok: true, strategy: "clarify" } });
    expect(chips).toContain("שלב העריכה: clarify");
  });

  it("הרצה בלי שלב עריכה — אף אחת מהתגיות האלה", () => {
    const chips = chipsOf({ mode: "story", designStage: { ok: true } });
    expect(chips.some((c) => c.includes("שלב העריכה"))).toBe(false);
    expect(chips.some((c) => c.includes("מפרט מצטבר"))).toBe(false);
  });
});
