import { describe, expect, it } from "vitest";
import {
  MAX_PRESERVE, buildEditStagePrompt, parseEditDecision, stagedEditPrompt,
} from "../editStage";
import { EDIT_SPEC_NONE } from "../spec";

/**
 * dialogue mode — שלב הטקסט של העריכה.
 *
 * שלוש קבוצות טענות, באותה חלוקה כמו `story/__tests__/designStage.test.ts`:
 *
 *  1. **ההצבות** — מה שנכנס במקום ה-placeholders, ובעיקר: שום placeholder לא
 *     נשאר בטקסט שיוצא. `{USER_REQUEST}` שלא הוחלף פירושו שהמודל מקבל את
 *     המילה הזו כהוראה.
 *  2. **הפענוח** — מה נחשב החלטה שמישה. `image_instruction` הוא היחיד
 *     שהקבילות נבדקת עליו, וזו החלטה עם נימוק (ראה `parseEditDecision`).
 *  3. **מה שנמסר למודל התמונה** — ההוראה וה-`preserve` יחד, במשפט אחד.
 */

const SPEC = {
  outer_silhouette: "a tapering band",
  metal_structure: "one continuous spine",
  negative_space: "seven narrow slots",
  rhythm_balance: "even, symmetric",
  manufacturability: "connected throughout",
};

const DECISION = (over: Record<string, unknown> = {}) => JSON.stringify({
  scope: "the right-hand third",
  image_instruction: "On the right-hand third, reduce the slots from seven to three.",
  preserve: ["the outer contour", "the spacing along the left half"],
  updated_spec: { ...SPEC, negative_space: "three wide slots on the right, four narrow on the left" },
  ...over,
});

describe("buildEditStagePrompt", () => {
  const prompt = buildEditStagePrompt({
    productType: "bracelet",
    request: "פחות בלאגן פה, זה יותר מדי",
    region: "right",
    spec: SPEC,
    lengthMm: 160.4,
  });

  it("המוצר, הבקשה, האזור והאורך נכנסים במקומם", () => {
    expect(prompt).toContain('"bracelet"');
    expect(prompt).toContain("פחות בלאגן פה, זה יותר מדי");
    expect(prompt).toContain("the right-hand third of the piece");
    expect(prompt).toContain("LENGTH: 160.4 mm");
  });

  it("שום placeholder לא שורד", () => {
    for (const token of [
      "{PRODUCT_TYPE}", "{USER_REQUEST}", "{REGION}", "{LENGTH_MM}",
      "{CURRENT_SPEC}", "{MAX_PRESERVE}",
    ]) {
      expect(prompt).not.toContain(token);
    }
  });

  it("המפרט המצטבר נכנס שדה-שדה, ולא כ-JSON", () => {
    // המודל קורא אותו כטקסט, לא מפענח אותו. JSON כאן היה מוסיף לו משימת
    // פענוח בלי שום תמורה, ובאותה נשימה גם דוגמת פלט שהוא עלול לחקות.
    expect(prompt).toContain("Outer silhouette: a tapering band");
    expect(prompt).toContain("Negative space: seven narrow slots");
    expect(prompt).not.toContain(EDIT_SPEC_NONE);
  });

  it("בלי מפרט: נכתב במפורש שאין, ולא נשארת כותרת ריקה", () => {
    // כותרת עם כלום מתחתיה נקראת כמפרט ריק — כלומר כהצהרה שהפריט שבתמונה
    // חסר צללית ומבנה, וזו הצהרה שגויה על פריט שקיים.
    const p = buildEditStagePrompt({ productType: "ring", request: "יותר עדין" });
    expect(p).toContain(EDIT_SPEC_NONE);
    expect(p).not.toContain("Outer silhouette:");
  });

  it("בלי אזור: נאמר שהלקוחה לא הצביעה, ולא מומצא אזור", () => {
    const p = buildEditStagePrompt({ productType: "ring", request: "יותר עדין" });
    expect(p).toContain("the customer did not point at a region");
  });

  it("בלי אורך: הפרומפט אומר זאת במפורש במקום להמציא מספר", () => {
    const p = buildEditStagePrompt({ productType: "ring", request: "x" });
    expect(p).toContain("LENGTH: not specified");
    expect(p).toContain('"ring"');
  });

  it("בקשה שמכילה תווי החלפה נכנסת כמו שהיא", () => {
    // `$&` ו-`$1` הם הפניות אחורה ב-`String.replace`. בקשה שמכילה אותם הייתה
    // משכתבת את עצמה — ולכן ההחלפה נעשית דרך פונקציה.
    const p = buildEditStagePrompt({ productType: "ring", request: "בעלות $& של $1 שקל" });
    expect(p).toContain("בעלות $& של $1 שקל");
  });

  it("רווחים ושורות בבקשה מתקפלים לשורה אחת", () => {
    const p = buildEditStagePrompt({ productType: "ring", request: "  שורה\n\n  ושורה  " });
    expect(p).toContain('"שורה ושורה"');
  });

  it("ההבחנה בין מקום לתכונה נאמרת במפורש", () => {
    // זהו הכשל שהשלב הזה קיים בשבילו: "שיהיה יותר סימטרי" עם צ'יפ "אזור ימין"
    // הוא בקשה על הפריט כולו, כי סימטריה אינה תכונה של שליש.
    expect(prompt).toContain("symmetry is not a property a third of a piece can have");
  });
});

describe("parseEditDecision", () => {
  it("החלטה מלאה נקראת", () => {
    const out = parseEditDecision(DECISION());
    expect(out?.decision.image_instruction).toContain("reduce the slots");
    expect(out?.decision.preserve).toEqual(["the outer contour", "the spacing along the left half"]);
    expect(out?.decision.scope).toBe("the right-hand third");
    expect(out?.decision.updated_spec?.negative_space).toContain("three wide slots");
  });

  it("גדר markdown מנוקה — הפרומפט אוסר, והמודלים עוטפים בכל זאת", () => {
    expect(parseEditDecision("```json\n" + DECISION() + "\n```")?.decision.image_instruction)
      .toContain("reduce the slots");
  });

  it("בלי `image_instruction` — null, וההרצה נופלת לפרומפט של היום", () => {
    expect(parseEditDecision(DECISION({ image_instruction: "" }))).toBeNull();
    expect(parseEditDecision(DECISION({ image_instruction: "   " }))).toBeNull();
    expect(parseEditDecision(JSON.stringify({ scope: "x", preserve: ["y"] }))).toBeNull();
  });

  it("`preserve` ריק **אינו** פוסל — זו בקשה שנוגעת בפריט כולו", () => {
    const out = parseEditDecision(DECISION({ preserve: [] }));
    expect(out).not.toBeNull();
    expect(out?.decision.preserve).toEqual([]);
  });

  it("`preserve` שאינו מערך מנוקה ולא פוסל", () => {
    // מודל שהחזיר מחרוזת אחת אמר משהו שמיש בצורה הלא נכונה, וההרצה כבר
    // שולם עליה.
    expect(parseEditDecision(DECISION({ preserve: "the outer contour" }))?.decision.preserve)
      .toEqual(["the outer contour"]);
    expect(parseEditDecision(DECISION({ preserve: [1, null, "ok", "  "] }))?.decision.preserve)
      .toEqual(["ok"]);
  });

  it("`updated_spec` חסר או פסול אינו פוסל — המפרט הקודם ממשיך", () => {
    expect(parseEditDecision(DECISION({ updated_spec: undefined }))?.decision.updated_spec)
      .toBeUndefined();
    expect(parseEditDecision(DECISION({ updated_spec: ["not", "an", "object"] }))?.decision.updated_spec)
      .toBeUndefined();
  });

  it("`needs_clarification` נשמר כשיש, ולא נוצר כשאין", () => {
    expect(parseEditDecision(DECISION({ needs_clarification: "איזה צד?" }))?.decision.needs_clarification)
      .toBe("איזה צד?");
    expect(parseEditDecision(DECISION())?.decision.needs_clarification).toBeUndefined();
  });

  it("כל קלט שאינו JSON של אובייקט — null", () => {
    for (const junk of ["", "   ", "not json", "null", "[]", '"a string"', "42", "{", DECISION().slice(0, 40)]) {
      expect(parseEditDecision(junk)).toBeNull();
    }
  });
});

describe("stagedEditPrompt", () => {
  it("ההוראה וה-preserve הם משפט אחד", () => {
    const decision = parseEditDecision(DECISION())!.decision;
    const out = stagedEditPrompt(decision);
    expect(out).toContain("reduce the slots from seven to three");
    expect(out).toContain("Leave these exactly as they are in the attached image:");
    expect(out).toContain("the outer contour; the spacing along the left half");
  });

  it("בלי preserve — ההוראה לבדה, בלי זנב ריק", () => {
    const decision = parseEditDecision(DECISION({ preserve: [] }))!.decision;
    expect(stagedEditPrompt(decision)).toBe(
      "On the right-hand third, reduce the slots from seven to three",
    );
  });

  it("הנקודה בסוף ההוראה יורדת — הפרומפט מוסיף אותה בעצמו", () => {
    // `buildRenderPrompt` בונה `"CHANGE REQUEST (apply only this): " + x + "."`.
    // נקודה כפולה אינה שגיאה, אבל היא סימן שהחיבור לא נבדק — וזה הצד שכן.
    expect(stagedEditPrompt({ image_instruction: "Draw it thinner.  " })).toBe("Draw it thinner");
  });

  it("רשימת preserve ארוכה נחתכת ואינה בולעת את ההוראה", () => {
    const many = Array.from({ length: MAX_PRESERVE + 4 }, (_, i) => `feature ${i}`);
    const out = stagedEditPrompt({ image_instruction: "Do X", preserve: many });
    expect(out).toContain(`feature ${MAX_PRESERVE - 1}`);
    expect(out).not.toContain(`feature ${MAX_PRESERVE}`);
  });
});
