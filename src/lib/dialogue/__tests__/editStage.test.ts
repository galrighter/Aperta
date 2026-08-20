import { describe, expect, it } from "vitest";
import {
  MAX_PRESERVE, buildEditStagePrompt, buildRespecRenderPrompt, parseEditDecision, stagedEditPrompt,
} from "../editStage";
import { EDIT_SPEC_NONE } from "../spec";

/**
 * dialogue mode — שלב הטקסט של העריכה.
 *
 * ארבע קבוצות טענות, באותה חלוקה כמו `story/__tests__/designStage.test.ts`:
 *
 *  1. **ההצבות** — מה שנכנס במקום ה-placeholders, ובעיקר: שום placeholder לא
 *     נשאר בטקסט שיוצא. `{USER_REQUEST}` שלא הוחלף פירושו שהמודל מקבל את
 *     המילה הזו כהוראה. ומאז respec — גם **בחירת הנוסח**: יש מפרט → ‏respec,
 *     אין → ייחוס. הפרומפט והמסירה חייבים להסכים (`runsRespec`).
 *  2. **הפענוח** — מה נחשב החלטה שמישה. `image_instruction` הוא היחיד
 *     שהקבילות נבדקת עליו, וזו החלטה עם נימוק (ראה `parseEditDecision`).
 *  3. **מה שנמסר למודל התמונה בעריכת ייחוס** — ההוראה וה-`preserve` יחד.
 *  4. **הפרומפט של respec** — פרומפט שלם מהמפרט, בלי שפת "תמונה מצורפת".
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

  it("שום placeholder לא שורד — בשני הנוסחים", () => {
    const reference = buildEditStagePrompt({ productType: "ring", request: "יותר עדין" });
    for (const token of [
      "{PRODUCT_TYPE}", "{USER_REQUEST}", "{REGION}", "{LENGTH_MM}",
      "{CURRENT_SPEC}", "{MAX_PRESERVE}",
    ]) {
      expect(prompt).not.toContain(token);
      expect(reference).not.toContain(token);
    }
  });

  it("יש מפרט → נוסח respec: יצירה מחדש מהמפרט, בלי preserve", () => {
    // ‏PROMPT_SPEC §6 — עם מפרט, ההוראה שנבנית היא הוראה מלאה על הפריט כולו,
    // והשימור יושב במפרט; `preserve` שייך לעריכת הייחוס בלבד.
    expect(prompt).toContain("REDRAWN FROM ITS SPECIFICATION");
    expect(prompt).toContain('"strategy": "respec"');
    expect(prompt).not.toContain('"preserve"');
    expect(prompt).not.toContain("the attached image");
  });

  it("המפרט המצטבר נכנס שדה-שדה עם תיוג מקור, ולא כ-JSON", () => {
    // המודל קורא אותו כטקסט, לא מפענח אותו. התיוג — `[inferred]` כברירת
    // מחדל — הוא מה שאומר לו איזה שדה קפוא ואיזה שלו (§1.3).
    expect(prompt).toContain("Outer silhouette [inferred]: a tapering band");
    expect(prompt).toContain("Negative space [inferred]: seven narrow slots");
    expect(prompt).not.toContain(EDIT_SPEC_NONE);
  });

  it("חוזה המדיום נאמר בנוסח respec — שם מזהים בקשה מחוץ למדיום (§2.5)", () => {
    expect(prompt).toContain("no engraving, no stones, no colour, no texture, no relief");
    expect(prompt).toContain('"clarify"');
  });

  it("בלי מפרט → נוסח הייחוס: נכתב במפורש שאין, ולא נשארת כותרת ריקה", () => {
    // כותרת עם כלום מתחתיה נקראת כמפרט ריק — כלומר כהצהרה שהפריט שבתמונה
    // חסר צללית ומבנה, וזו הצהרה שגויה על פריט שקיים. ‏respec על מפרט ריק
    // אינו קיים בכלל — הנוסח שנבנה הוא של עריכת הייחוס, עם preserve.
    const p = buildEditStagePrompt({ productType: "ring", request: "יותר עדין" });
    expect(p).toContain(EDIT_SPEC_NONE);
    expect(p).not.toContain("Outer silhouette:");
    expect(p).toContain('"preserve"');
    expect(p).toContain("edit the existing image");
    expect(p).not.toContain("REDRAWN FROM ITS SPECIFICATION");
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

  it("`strategy` נקרא כשהוא אחד משלושת הערכים", () => {
    for (const s of ["respec", "clarify", "reference_edit"] as const) {
      expect(parseEditDecision(DECISION({ strategy: s }))?.decision.strategy).toBe(s);
    }
  });

  it("`strategy` חסר או זבל נקרא כחסר — כלומר respec, ואינו פוסל", () => {
    // מי שמכריע אם הייחוס נשלח הוא `runsRespec`, לא המחרוזת; פסילה על
    // תיוג שגוי הייתה שולחת סבב שלם לנפילה-לאחור בגלל שדה קישוט.
    expect(parseEditDecision(DECISION())?.decision.strategy).toBeUndefined();
    for (const junk of ["", "Respec", "redraw", 7, null]) {
      const out = parseEditDecision(DECISION({ strategy: junk }));
      expect(out).not.toBeNull();
      expect(out?.decision.strategy).toBeUndefined();
    }
  });

  it("`sources` שבתוך `updated_spec` עובר הלאה — המיזוג מנקה אותו, לא הפענוח", () => {
    const out = parseEditDecision(DECISION({
      updated_spec: { negative_space: "three slots", sources: { negative_space: "user" } },
    }));
    expect(out?.decision.updated_spec?.sources?.negative_space).toBe("user");
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

describe("buildRespecRenderPrompt — מה שמודל התמונה מקבל ב-respec", () => {
  const CANVAS = { widthPx: 1536, heightPx: 1024 };
  const DECIDED = {
    image_instruction: "Draw a tapering band with three wide slots on the right.",
    strategy: "respec" as const,
  };
  const FULL = {
    outer_silhouette: "a tapering band",
    negative_space: "three wide slots on the right",
    length_to_width_ratio: 7.25,
    sources: { negative_space: "user" as const },
  };
  const prompt = buildRespecRenderPrompt({
    spec: FULL, decision: DECIDED, canvas: CANVAS, rows: 3, thicknessMm: 1.5,
  });

  it("ההוראה והמפרט נכנסים; שום placeholder לא שורד", () => {
    expect(prompt).toContain("Draw a tapering band with three wide slots on the right.");
    expect(prompt).toContain("Outer silhouette: a tapering band");
    for (const token of ["{CANVAS_SHAPE}", "{PIECES_WORD}", "{INSTRUCTION}", "{SPEC}", "{PROPORTION}", "{LAYOUT}", "{THICKNESS_MM}"]) {
      expect(prompt).not.toContain(token);
    }
  });

  it("**בלי שפת תמונה מצורפת** — אין ייחוס, וזו כל הנקודה של §6", () => {
    expect(prompt).not.toContain("attached");
    expect(prompt).not.toContain("CHANGE REQUEST");
  });

  it("**בלי תיוגי מקור** — בדרך למודל התמונה כל השדות שווים (§1.3)", () => {
    expect(prompt).not.toContain("[user]");
    expect(prompt).not.toContain("[inferred]");
  });

  it("היחס נאכף — מהמפרט, ובנפילה ממידות הפריט", () => {
    expect(prompt).toContain("length-to-width ratio is 1:7.3");
    const fromDims = buildRespecRenderPrompt({
      spec: { outer_silhouette: "a band" }, decision: DECIDED, canvas: CANVAS, rows: 3,
      fallbackRatio: 160 / 18,
    });
    expect(fromDims).toContain("length-to-width ratio is 1:8.9");
    // בלי אף אחד מהם — אין משפט פרופורציה, ולא מספר מומצא.
    const none = buildRespecRenderPrompt({
      spec: { outer_silhouette: "a band" }, decision: DECIDED, canvas: CANVAS, rows: 3,
    });
    expect(none).not.toContain("PROPORTION");
  });

  it("השורות הן עותקים של אותו פריט — לא וריאציות", () => {
    expect(prompt).toContain("exactly THREE flat jewellery blanks");
    expect(prompt).toContain("THREE copies of that one piece");
    expect(prompt).toContain("not a variation of it");
    // חוזה הפריסה שנמדד: פס לבן רצוף בין כל שני עותקים.
    expect(prompt).toContain("unbroken horizontal band of pure white");
  });

  it("פריט יחיד — בלי שפת שורות בכלל", () => {
    const single = buildRespecRenderPrompt({ spec: FULL, decision: DECIDED, canvas: CANVAS, rows: 1 });
    expect(single).toContain("exactly ONE flat jewellery blanks");
    expect(single).toContain("this one piece");
    expect(single).not.toContain("copies");
  });

  it("חוזה המדיום — מילה במילה כמו ביצירה", () => {
    expect(prompt).toContain("Solid black on a pure white background");
    expect(prompt).toContain("BLACK IS METAL. WHITE IS NOT.");
    expect(prompt).toContain("1.5 mm brass");
  });

  it("צורת הקנבס נגזרת מהקנבס שנמסר, לא מונחת", () => {
    expect(prompt).toContain("landscape / wide");
    const tall = buildRespecRenderPrompt({
      spec: FULL, decision: DECIDED, canvas: { widthPx: 1024, heightPx: 1536 }, rows: 3,
    });
    expect(tall).toContain("portrait / tall");
  });

  it("אותה קריאה, אותו פלט — הפרומפט דטרמיניסטי", () => {
    expect(buildRespecRenderPrompt({
      spec: FULL, decision: DECIDED, canvas: CANVAS, rows: 3, thicknessMm: 1.5,
    })).toBe(prompt);
  });
});
