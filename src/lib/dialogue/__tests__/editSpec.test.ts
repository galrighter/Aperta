import { describe, expect, it } from "vitest";
import { EDIT_SPEC_NONE, describeSpec, hasSpec, nextEditSpec, type EditSpec } from "../spec";

/**
 * dialogue mode — המפרט המצטבר (§2.2 ב-DIALOGUE_PLAN).
 *
 * **מה שנבדק כאן הוא הטענה המרכזית של שלב A**, ולא שירות עזר: "עריכה של
 * תמונה הופכת לעריכת פרומפט". היום סבב 5 אינו יודע מה נקבע בסבב 2, כי כל
 * סבב רואה רק את התמונה ואת המשפט האחרון. אם המיזוג כאן שגוי — אם סבב אחד
 * דורס את מה שנקבע בקודמים — המנגנון לא רק שלא עוזר, הוא **מזיק**: הוא
 * מוסיף עלות של שלב טקסט ומאבד הקשר.
 */

const ROUND_1: EditSpec = {
  outer_silhouette: "a tapering band",
  metal_structure: "one continuous spine",
  negative_space: "seven narrow slots",
  rhythm_balance: "even, symmetric",
  manufacturability: "connected throughout",
};

describe("nextEditSpec", () => {
  it("שדות שהמודל כתב מתעדכנים", () => {
    const out = nextEditSpec(ROUND_1, { updated_spec: { negative_space: "three wide slots" } });
    expect(out.negative_space).toBe("three wide slots");
  });

  it("**שדות שהמודל לא כתב נשארים** — זה כל המנגנון", () => {
    // מודל שהחזיר שלושה שדות מתוך חמישה לא הצהיר שהשניים האחרים נעלמו; הוא
    // פשוט לא כתב אותם. החלפה הייתה מוחקת בסבב אחד מה שנקבע בחמישה.
    const out = nextEditSpec(ROUND_1, { updated_spec: { negative_space: "three wide slots" } });
    expect(out.outer_silhouette).toBe("a tapering band");
    expect(out.metal_structure).toBe("one continuous spine");
    expect(out.rhythm_balance).toBe("even, symmetric");
    expect(out.manufacturability).toBe("connected throughout");
  });

  it("שדה ריק או רווחים נחשב «לא נכתב» ואינו מוחק", () => {
    const out = nextEditSpec(ROUND_1, { updated_spec: { outer_silhouette: "", metal_structure: "   " } });
    expect(out.outer_silhouette).toBe("a tapering band");
    expect(out.metal_structure).toBe("one continuous spine");
  });

  it("בלי `updated_spec` — המפרט הקודם ממשיך כמו שהוא", () => {
    expect(nextEditSpec(ROUND_1, { image_instruction: "x" })).toEqual(ROUND_1);
  });

  it("בלי מפרט קודם — מה שהמודל כתב הוא ההתחלה", () => {
    expect(nextEditSpec(null, { updated_spec: { outer_silhouette: "a straight band" } }))
      .toEqual({ outer_silhouette: "a straight band" });
    expect(nextEditSpec(undefined, {})).toEqual({});
  });

  it("המפרט הקודם אינו משתנה — הפונקציה טהורה", () => {
    const before = { ...ROUND_1 };
    nextEditSpec(ROUND_1, { updated_spec: { negative_space: "x" } });
    expect(ROUND_1).toEqual(before);
  });

  it("שדות זרים ב-`updated_spec` אינם נכנסים", () => {
    // המפרט הוא חוזה מול `designStage`, ושדה שנכנס כאן ולא שם שובר את
    // השרשרת בחוליה הראשונה.
    const out = nextEditSpec(null, {
      updated_spec: { outer_silhouette: "a band", nonsense: "x" } as EditSpec,
    });
    expect(out).toEqual({ outer_silhouette: "a band" });
  });

  it("חמישה סבבים ברצף — מה שנקבע בראשון עדיין שם בחמישי", () => {
    // זהו הטסט של הטענה עצמה: "תחזירי את הקצב שהיה בהתחלה" הוא בקשה שאפשר
    // לענות עליה רק אם הקצב שנקבע בסבב 2 שרד עד סבב 5.
    let spec: EditSpec = ROUND_1;
    spec = nextEditSpec(spec, { updated_spec: { rhythm_balance: "syncopated, denser at the right" } });
    spec = nextEditSpec(spec, { updated_spec: { negative_space: "three wide slots" } });
    spec = nextEditSpec(spec, { updated_spec: { metal_structure: "spine with two ribs" } });
    spec = nextEditSpec(spec, { updated_spec: { outer_silhouette: "a tapering band with a waist" } });
    expect(spec).toEqual({
      outer_silhouette: "a tapering band with a waist",
      metal_structure: "spine with two ribs",
      negative_space: "three wide slots",
      rhythm_balance: "syncopated, denser at the right",
      manufacturability: "connected throughout",
    });
  });
});

describe("describeSpec", () => {
  it("שדות שנכתבו יוצאים לפי סדר קבוע", () => {
    const text = describeSpec({ negative_space: "slots", outer_silhouette: "a band" });
    expect(text.indexOf("Outer silhouette")).toBeLessThan(text.indexOf("Negative space"));
  });

  it("שדה שלא נכתב אינו מייצר שורה ריקה", () => {
    expect(describeSpec({ outer_silhouette: "a band" })).toBe("Outer silhouette: a band");
  });

  it("מפרט ריק, `null` ו-`undefined` — כולם אומרים שאין, במפורש", () => {
    for (const empty of [null, undefined, {}, { outer_silhouette: "   " }]) {
      expect(describeSpec(empty)).toBe(EDIT_SPEC_NONE);
    }
  });
});

describe("hasSpec", () => {
  it("שדה אחד שנכתב מספיק", () => {
    expect(hasSpec({ outer_silhouette: "a band" })).toBe(true);
  });
  it("ריק, רווחים, null — אין", () => {
    expect(hasSpec({})).toBe(false);
    expect(hasSpec({ outer_silhouette: "  " })).toBe(false);
    expect(hasSpec(null)).toBe(false);
  });
});
