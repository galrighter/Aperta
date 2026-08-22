import { describe, expect, it } from "vitest";
import { RATIO_BAND, ratioBandFor } from "@/lib/story/ratio";
import {
  DENSITY_SPEC_TEXT, EDIT_CONTROL_KEYS, SYMMETRY_SPEC_TEXT,
  applyEditChoice, coerceEditChoice, defaultRatioFor, describeEditChoice, widthThirdOf,
} from "../editControls";
import type { EditSpec } from "../spec";

/**
 * dialogue mode — מצב-מדויק בתוך השיחה (תור `edit`).
 *
 * מה שנבדק כאן הוא מה שיכול להיות שגוי **בשקט**: קלט חיצוני שממשיך בלי
 * ניקוי, קביעה שאינה נכתבת `user` (ואז respec חופשי לדרוס אותה), והצבה
 * שדורסת שדות שהקביעה לא נגעה בהם.
 */

describe("coerceEditChoice", () => {
  it("זבל אינו קביעה — null על כל צורה שאינה אובייקט עם ערך תקף", () => {
    for (const raw of [null, undefined, "x", [], {}, { ratio: "wat" }, { symmetry: "diagonal" }]) {
      expect(coerceEditChoice(raw, "bracelet")).toBeNull();
    }
  });

  it("היחס נצבט לטווח המוצר ומעוגל — המחוון במסך ממילא תחום", () => {
    const [wide, thin] = RATIO_BAND.bracelet;
    expect(coerceEditChoice({ ratio: 1000 }, "bracelet")?.ratio).toBe(thin);
    expect(coerceEditChoice({ ratio: 0.5 }, "bracelet")?.ratio).toBe(wide);
    expect(coerceEditChoice({ ratio: 8.54321 }, "bracelet")?.ratio).toBe(8.5);
  });

  it("צ'יפים רק מהרשימה — ומה שתקף עובר גם כשהיתר נזרק", () => {
    const out = coerceEditChoice(
      { ratio: -3, symmetry: "asymmetric", density: "high", extra: "x" },
      "ring",
    )!;
    expect(out).toEqual({ symmetry: "asymmetric", density: "high" });
  });
});

describe("describeEditChoice", () => {
  it("נושא את הטקסטים הקנוניים עצמם — מה שהמודל רואה הוא מה שהמפרט יקבל", () => {
    const text = describeEditChoice({ ratio: 8.5, symmetry: "symmetric", density: "low" });
    expect(text).toContain("1:8.5");
    expect(text).toContain(SYMMETRY_SPEC_TEXT.symmetric);
    expect(text).toContain(DENSITY_SPEC_TEXT.low);
  });

  it("מה שלא נקבע אינו מתואר — קביעה חלקית היא מצב תקין", () => {
    const text = describeEditChoice({ density: "medium" });
    expect(text).not.toContain("ratio");
    expect(text).not.toContain("Symmetry");
    expect(text).toContain(DENSITY_SPEC_TEXT.medium);
  });
});

describe("applyEditChoice", () => {
  it("קביעה נכתבת מילה-במילה, מקור user — קפואה מול respec (§1.3)", () => {
    const out = applyEditChoice(null, { ratio: 8.5, symmetry: "asymmetric", density: "high" });
    expect(out.length_to_width_ratio).toBe(8.5);
    expect(out.symmetry).toBe(SYMMETRY_SPEC_TEXT.asymmetric);
    expect(out.metal_void_balance).toBe(DENSITY_SPEC_TEXT.high);
    expect(out.sources).toEqual({
      length_to_width_ratio: "user",
      symmetry: "user",
      metal_void_balance: "user",
    });
  });

  it("דורסת גם שדה user קודם — קביעה בפקד היא בדיוק 'בקשה שנוגעת בו במפורש'", () => {
    const prior: EditSpec = {
      symmetry: "roughly mirrored, with one playful break",
      sources: { symmetry: "user" },
    };
    const out = applyEditChoice(prior, { symmetry: "symmetric" });
    expect(out.symmetry).toBe(SYMMETRY_SPEC_TEXT.symmetric);
    expect(out.sources?.symmetry).toBe("user");
  });

  it("אינה נוגעת במה שהקביעה לא קבעה — ערכים ומקורות קודמים נשמרים", () => {
    const prior: EditSpec = {
      outer_silhouette: "a narrow band",
      metal_void_balance: "about a third open",
      sources: { outer_silhouette: "user", metal_void_balance: "inferred" },
    };
    const out = applyEditChoice(prior, { ratio: 6 });
    expect(out.outer_silhouette).toBe("a narrow band");
    expect(out.metal_void_balance).toBe("about a third open");
    expect(out.sources?.outer_silhouette).toBe("user");
    expect(out.sources?.metal_void_balance).toBe("inferred");
    expect(out.sources?.length_to_width_ratio).toBe("user");
  });
});

describe("שפת הבועה ונקודת הפתיחה", () => {
  it("שלישים לוגריתמיים — הקצוות בקצוות, האמצע הגיאומטרי באמצע", () => {
    const band = ratioBandFor("bracelet");
    const [wide, thin] = band;
    expect(widthThirdOf(wide, band)).toBe("wide");
    expect(widthThirdOf(thin, band)).toBe("narrow");
    expect(widthThirdOf(Math.sqrt(wide * thin), band)).toBe("medium");
    // מחוץ לטווח — נצבט, לא מתפוצץ.
    expect(widthThirdOf(0.1, band)).toBe("wide");
    expect(widthThirdOf(1000, band)).toBe("narrow");
  });

  it("נקודת הפתיחה בתוך הטווח, לשני המוצרים", () => {
    for (const product of ["bracelet", "ring"] as const) {
      const [wide, thin] = ratioBandFor(product);
      const def = defaultRatioFor(product);
      expect(def).toBeGreaterThanOrEqual(wide);
      expect(def).toBeLessThanOrEqual(thin);
    }
  });

  it("רשימת הפקדים סגורה — שלושה, ו-feel בכוונה אינו בהם", () => {
    expect([...EDIT_CONTROL_KEYS]).toEqual(["width", "symmetry", "density"]);
  });
});
