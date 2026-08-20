import { describe, expect, it } from "vitest";
import {
  EDIT_SPEC_NONE, coerceEditSpec, describeSpec, hasSpec, nextEditSpec, ratioOf, runsRespec,
  sourceOf, type EditSpec,
} from "../spec";

/**
 * dialogue mode — המפרט המצטבר (§2.2 ב-DIALOGUE_PLAN; ‏§1.3, §2 ו-§6
 * ב-PROMPT_SPEC).
 *
 * **מה שנבדק כאן הוא הטענה המרכזית של שלב A**, ולא שירות עזר: "עריכה של
 * תמונה הופכת לעריכת פרומפט". היום סבב 5 אינו יודע מה נקבע בסבב 2, כי כל
 * סבב רואה רק את התמונה ואת המשפט האחרון. אם המיזוג כאן שגוי — אם סבב אחד
 * דורס את מה שנקבע בקודמים — המנגנון לא רק שלא עוזר, הוא **מזיק**: הוא
 * מוסיף עלות של שלב טקסט ומאבד הקשר.
 *
 * ומאז respec המיזוג הוא גם מה שמחזיק את "כל השאר נשאר" בלי תמונת ייחוס:
 * שדה `user` שהיה מופשר בשקט הוא בדיוק סטייה שהלקוחה לא ביקשה.
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
    // מודל שהחזיר שלושה שדות מתוך עשרה לא הצהיר שהיתר נעלמו; הוא פשוט לא
    // כתב אותם. החלפה הייתה מוחקת בסבב אחד מה שנקבע בחמישה.
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

  it("בלי מפרט קודם — מה שהמודל כתב הוא ההתחלה, במקור `chosen`", () => {
    // ערך חדש בלי הצהרת מקור הוא בחירה של המודל — `chosen`, לא ניחוש `user`.
    expect(nextEditSpec(null, { updated_spec: { outer_silhouette: "a straight band" } }))
      .toEqual({ outer_silhouette: "a straight band", sources: { outer_silhouette: "chosen" } });
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
    expect(out).toEqual({ outer_silhouette: "a band", sources: { outer_silhouette: "chosen" } });
  });

  it("השדות החדשים (§2.1–2.3) ממוזגים כמו החמישייה המקורית", () => {
    const out = nextEditSpec(ROUND_1, {
      updated_spec: {
        symmetry: "mirrored around the centre",
        ends_treatment: "both ends cut straight",
        metal_void_balance: "about a third of the area open",
        elements: "seven elliptical openings, evenly spaced",
        region_map: "right: three openings; centre: solid; left: four openings",
      },
    });
    expect(out.symmetry).toBe("mirrored around the centre");
    expect(out.region_map).toBe("right: three openings; centre: solid; left: four openings");
    // ומה שלא נכתב — נשאר.
    expect(out.outer_silhouette).toBe("a tapering band");
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
      // כל שינוי בלי הצהרת מקור הוא בחירת המודל; מה שלא נכתב לא תויג.
      sources: {
        outer_silhouette: "chosen",
        metal_structure: "chosen",
        negative_space: "chosen",
        rhythm_balance: "chosen",
      },
    });
  });
});

describe("nextEditSpec — המקורות (§1.3)", () => {
  const LOCKED: EditSpec = {
    ...ROUND_1,
    sources: { negative_space: "user", outer_silhouette: "inferred" },
  };

  it("ערך שהשתנה מקבל את המקור שהוצהר", () => {
    const out = nextEditSpec(LOCKED, {
      updated_spec: {
        negative_space: "three wide slots",
        sources: { negative_space: "user" },
      },
    });
    expect(out.sources?.negative_space).toBe("user");
  });

  it("**ערך שלא השתנה אינו נחלש** — מודל אינו מפשיר שדה user בשקט", () => {
    // זה השומר של respec: שדה שהלקוחה קיבעה ותויג מחדש כ-`chosen` היה הופך
    // חופשי לשכתוב בסבב הבא — סטייה שאיש לא ביקש.
    const out = nextEditSpec(LOCKED, {
      updated_spec: {
        negative_space: "seven narrow slots",
        sources: { negative_space: "chosen" },
      },
    });
    expect(out.sources?.negative_space).toBe("user");
  });

  it("ערך שלא השתנה כן מתחזק — שדות זזים שמאלה (§3.5)", () => {
    const out = nextEditSpec(LOCKED, {
      updated_spec: {
        outer_silhouette: "a tapering band",
        sources: { outer_silhouette: "user" },
      },
    });
    expect(out.sources?.outer_silhouette).toBe("user");
  });

  it("תיוג שאינו אחד משלושת הערכים נזרק — מהעבר ומההצהרה", () => {
    const junk = {
      ...ROUND_1,
      sources: { outer_silhouette: "gospel" },
    } as unknown as EditSpec;
    const out = nextEditSpec(junk, {
      updated_spec: {
        negative_space: "three wide slots",
        sources: { negative_space: "definitely" },
      } as unknown as EditSpec,
    });
    expect(out.sources).toEqual({ negative_space: "chosen" });
  });

  it("שדה בלי תיוג נקרא inferred — יציב, לא חופשי", () => {
    expect(sourceOf(ROUND_1, "outer_silhouette")).toBe("inferred");
    expect(sourceOf(LOCKED, "negative_space")).toBe("user");
  });
});

describe("nextEditSpec — היחס", () => {
  it("יחס שנכתב נכנס, ובלי הצהרה מקורו chosen", () => {
    const out = nextEditSpec(ROUND_1, { updated_spec: { length_to_width_ratio: 9 } });
    expect(out.length_to_width_ratio).toBe(9);
    expect(out.sources?.length_to_width_ratio).toBe("chosen");
  });

  it("יחס פסול אינו נכנס ואינו מוחק את הקודם", () => {
    const prev: EditSpec = { ...ROUND_1, length_to_width_ratio: 7 };
    for (const bad of [0, -3, NaN, "wide" as unknown as number]) {
      const out = nextEditSpec(prev, { updated_spec: { length_to_width_ratio: bad } });
      expect(out.length_to_width_ratio).toBe(7);
    }
  });

  it("ratioOf — מספר חיובי בלבד; זבל מה-jsonb נקרא כחסר", () => {
    expect(ratioOf({ length_to_width_ratio: 7.5 })).toBe(7.5);
    expect(ratioOf({ length_to_width_ratio: 0 })).toBeNull();
    expect(ratioOf({ length_to_width_ratio: "9" as unknown as number })).toBe(9);
    expect(ratioOf({ length_to_width_ratio: "wide" as unknown as number })).toBeNull();
    expect(ratioOf(null)).toBeNull();
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

  it("היחס יוצא כשורה, אחרי שדות הטקסט", () => {
    const text = describeSpec({ outer_silhouette: "a band", length_to_width_ratio: 7.25 });
    expect(text).toContain("Length-to-width ratio: 1:7.3");
    expect(text.indexOf("Outer silhouette")).toBeLessThan(text.indexOf("Length-to-width ratio"));
  });

  it("יחס בלי אף שדה טקסט אינו מפרט — ואינו מודפס", () => {
    expect(describeSpec({ length_to_width_ratio: 7 })).toBe(EDIT_SPEC_NONE);
  });

  it("תיוגי המקור יוצאים רק כשמבקשים — לפרומפט התכנון, לא לפרומפט הביצוע", () => {
    const spec: EditSpec = {
      outer_silhouette: "a band",
      negative_space: "slots",
      sources: { negative_space: "user" },
    };
    const planning = describeSpec(spec, { sources: true });
    expect(planning).toContain("Outer silhouette [inferred]: a band");
    expect(planning).toContain("Negative space [user]: slots");
    // ברירת המחדל — בלי תיוג בכלל: מה שמודל התמונה מקבל.
    expect(describeSpec(spec)).not.toContain("[user]");
    expect(describeSpec(spec)).not.toContain("[inferred]");
  });

  it("אותו מפרט פעמיים — אותו טקסט. דטרמיניזם הוא כל העניין", () => {
    const spec: EditSpec = { ...ROUND_1, length_to_width_ratio: 8, sources: { negative_space: "user" } };
    expect(describeSpec(spec, { sources: true })).toBe(describeSpec(spec, { sources: true }));
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
  it("יחס או sources לבדם אינם מפרט — אי אפשר לצייר מהם פריט", () => {
    expect(hasSpec({ length_to_width_ratio: 7 })).toBe(false);
    expect(hasSpec({ sources: { outer_silhouette: "user" } })).toBe(false);
  });
});

describe("coerceEditSpec — קלט חיצוני אינו הצהרה", () => {
  it("שדות תקפים עוברים; זבל נזרק בשקט", () => {
    expect(coerceEditSpec({
      outer_silhouette: "a band",
      negative_space: 7,
      length_to_width_ratio: "8",
      nonsense: "x",
      sources: { outer_silhouette: "user", negative_space: "gospel" },
    })).toEqual({
      outer_silhouette: "a band",
      length_to_width_ratio: 8,
      sources: { outer_silhouette: "user" },
    });
  });

  it("כלום שמיש — `null`, לא אובייקט ריק", () => {
    for (const empty of [null, undefined, [], "spec", { nonsense: "x" }, {}]) {
      expect(coerceEditSpec(empty)).toBeNull();
    }
  });
});

describe("runsRespec — מתי מציירים מחדש מהמפרט (§6)", () => {
  const DECISION = { image_instruction: "draw a band" };

  it("יש מפרט, אין כיתוב, לא התבקש ייחוס — respec", () => {
    expect(runsRespec({ decision: DECISION, priorSpec: ROUND_1 })).toBe(true);
  });

  it("`strategy` חסר = respec; ‏`clarify` ממשיך כ-respec — השאלה נרשמת", () => {
    expect(runsRespec({ decision: { ...DECISION, strategy: "respec" }, priorSpec: ROUND_1 })).toBe(true);
    expect(runsRespec({ decision: { ...DECISION, strategy: "clarify" }, priorSpec: ROUND_1 })).toBe(true);
  });

  it("המודל ביקש ייחוס — לא", () => {
    expect(runsRespec({ decision: { ...DECISION, strategy: "reference_edit" }, priorSpec: ROUND_1 })).toBe(false);
  });

  it("**מפרט ריק — לא.** עיצובים מלפני ההזרעה אינם רצים respec", () => {
    // ‏respec על מפרט ריק אינו עריכה אלא פריט חדש — וזו גם מלכודת המדידה:
    // מפרט-מתחיל-ריק היה נמדד לרעת המסלול החדש.
    expect(runsRespec({ decision: DECISION, priorSpec: null })).toBe(false);
    expect(runsRespec({ decision: DECISION, priorSpec: {} })).toBe(false);
    expect(runsRespec({ decision: DECISION, priorSpec: { length_to_width_ratio: 7 } })).toBe(false);
  });

  it("יש כיתוב — לא: הוא חי רק בתמונה הקיימת", () => {
    expect(runsRespec({ decision: DECISION, priorSpec: ROUND_1, lettering: true })).toBe(false);
  });

  it("אין החלטה בכלל — לא. המסלול הרגיל לעולם אינו מגיע לכאן", () => {
    expect(runsRespec({ decision: null, priorSpec: ROUND_1 })).toBe(false);
    expect(runsRespec({ priorSpec: ROUND_1 })).toBe(false);
  });
});
