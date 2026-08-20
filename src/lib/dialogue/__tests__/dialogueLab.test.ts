import { describe, expect, it } from "vitest";
import {
  IMAGE_CALL_USD, blindOrder, closureCoverage, dispersion, gradeInstruction, interpretiveExcess,
  reportLab, summariseArm, textUsd,
  type LabRound, type LabSession,
} from "../lab";

/**
 * dialogue mode — רתמת המדידה (‏A0 ב-DIALOGUE_PLAN §7).
 *
 * **הטענה הנבדקת כאן היא על המדידה, לא על המסלול.** דוח שסופר לא נכון גרוע
 * ממדידה שלא נעשתה: הוא נראה כמו ראיה. שלוש נקודות שכל אחת מהן יכולה להטות
 * את המסקנה לכיוון הלא נכון, ולכן כל אחת נבדקת:
 *
 *  1. **מה נספר.** סבבים אחרי "זה מה שביקשתי" אינם עלות של המסלול.
 *  2. **`null` אינו מספר.** בקשה שלא הוכרעה אינה "5 סבבים" ואינה 0.
 *  3. **מחיר שאינו ידוע אינו אפס.** ראה `TEXT_PRICES`.
 */

const round = (over: Partial<LabRound>): LabRound => ({
  arm: "baseline",
  request: "פחות בלאגן",
  imagePrompt: "…",
  satisfied: false,
  intentCaptured: null,
  ...over,
});

describe("gradeInstruction — ציר התיאור הגרפי", () => {
  it("הוראה שמפרטת את ארבעת הצירים מקבלת 4", () => {
    const g = gradeInstruction(
      "Taper the outer contour toward the right end; keep one continuous spine of metal, "
      + "reduce the openings from seven narrow slots to three wider ones, spaced evenly along the length.",
    );
    expect(g.covered).toBe(4);
    expect(g.axes).toEqual({ silhouette: true, structure: true, negativeSpace: true, rhythm: true });
    expect(g.echo).toBe(false);
    expect(g.hebrew).toBe(false);
  });

  it("עברית שנשארה בהוראה — פסילה, לא ניקוד", () => {
    // מודל התמונה מקבל את המחרוזת הזו כהוראת ציור. עברית בתוכה פירושה
    // שהשלב לא עשה את עבודתו — הוא העביר הלאה את הקלט במקום לתרגם אותו.
    expect(gradeInstruction("Make the right side פחות בלאגן").hebrew).toBe(true);
  });

  it("תרגום של הבקשה במקום הוראה — `echo`", () => {
    // ‏§7.1: "האם ה-image_instruction מפרט… או חוזר על העברית באנגלית".
    expect(gradeInstruction("Make the right side less busy").echo).toBe(true);
    expect(gradeInstruction("Make it calmer and more elegant overall, with a nicer feeling").echo)
      .toBe(true);
  });

  it("שפה רגשית ארוכה אינה מכסה שום ציר", () => {
    const g = gradeInstruction(
      "The piece should feel calmer and more intentional, evoking a sense of quiet memory and warmth",
    );
    expect(g.covered).toBe(0);
    expect(g.echo).toBe(true);
  });

  it("מילה בתוך מילה אינה נחשבת", () => {
    // `"cut"` אינו אמור להידלק על `"circuit"`, אבל ביטוי דו-מילי כן נתפס.
    expect(gradeInstruction("A circuitous outline").axes.negativeSpace).toBe(false);
    expect(gradeInstruction("Widen the negative space between the arms").axes.negativeSpace).toBe(true);
  });

  it("הוראה ריקה אינה echo — היא פשוט אין", () => {
    expect(gradeInstruction("").echo).toBe(false);
    expect(gradeInstruction(null).covered).toBe(0);
  });
});

describe("summariseArm — מה נספר", () => {
  const rounds: LabRound[] = [
    round({ arm: "baseline", satisfied: false }),
    round({ arm: "baseline", satisfied: false }),
    round({ arm: "baseline", satisfied: true }),
    // סבב רביעי, אחרי שהיא כבר קיבלה את מה שביקשה — לא חלק מהעלות.
    round({ arm: "baseline", satisfied: true }),
  ];

  it("הספירה נעצרת בסבב שבו הלקוחה הייתה מרוצה", () => {
    const s = summariseArm("baseline", rounds, "gpt-5.6-luna");
    expect(s.roundsToSatisfaction).toBe(3);
    expect(s.rounds).toBe(3);
    expect(s.imageCalls).toBe(3);
    expect(s.imageUsd).toBeCloseTo(3 * IMAGE_CALL_USD, 10);
  });

  it("לא הגיעה לשם — `null`, ולא מספר הסבבים", () => {
    const s = summariseArm("baseline", [round({}), round({})], "gpt-5.6-luna");
    expect(s.roundsToSatisfaction).toBeNull();
    expect(s.rounds).toBe(2);
  });

  it("סבבים של הזרוע השנייה אינם נספרים", () => {
    const mixed = [...rounds, round({ arm: "dialogue", satisfied: true })];
    expect(summariseArm("baseline", mixed, "gpt-5.6-luna").rounds).toBe(3);
    expect(summariseArm("dialogue", mixed, "gpt-5.6-luna").roundsToSatisfaction).toBe(1);
  });

  it("המסלול הקיים — עלות טקסט אפס, לא «לא ידוע»", () => {
    // אין מה לתמחר: לא רץ שלב טקסט. `null` שמור למצב שבו הוא כן רץ ואין לו
    // מחיר מאומת.
    const s = summariseArm("baseline", rounds, "gpt-5.6-luna");
    expect(s.textUsd).toBe(0);
    expect(s.totalUsd).toBeCloseTo(3 * IMAGE_CALL_USD, 10);
  });

  it("מודל בלי מחיר מאומת — `null` מצטבר עד לסך הכול", () => {
    // ‏§5.1 מציין במפורש שמחיר המכהן לא אומת. מספר מומצא בדוח שמכריע בין
    // מסלולים הוא הדרך הבטוחה ביותר להכריע לכיוון הלא נכון.
    const usage = { inputTokens: 900, outputTokens: 1400, totalTokens: 2300 };
    const s = summariseArm("dialogue", [round({ arm: "dialogue", satisfied: true, usage })], "gpt-5.6-luna");
    expect(s.textUsd).toBeNull();
    expect(s.totalUsd).toBeNull();
    expect(s.textTokens.total).toBe(2300);
  });

  it("מודל עם מחיר מאומת — סך הכול הוא מספר", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 };
    const s = summariseArm("dialogue", [round({ arm: "dialogue", satisfied: true, usage })], "deepseek-v4-flash");
    expect(s.textUsd).toBeCloseTo(0.14 + 0.28, 10);
    expect(s.totalUsd).toBeCloseTo(0.14 + 0.28 + IMAGE_CALL_USD, 10);
  });

  it("יציבות ה-JSON — רק סבבים ששלב הטקסט רץ בהם נספרים", () => {
    const rs: LabRound[] = [
      round({ arm: "dialogue", attempts: 1 }),
      round({ arm: "dialogue", attempts: 2 }),
      round({ arm: "dialogue", attempts: 1, satisfied: true }),
    ];
    expect(summariseArm("dialogue", rs, "gpt-5.6-luna").firstParseRate).toBeCloseTo(2 / 3, 10);
    expect(summariseArm("baseline", [round({})], "gpt-5.6-luna").firstParseRate).toBeNull();
  });

  it("נפילות־לאחור נספרות — הן ההתנהגות המתוכננת, וצריך לדעת כמה", () => {
    const rs = [round({ arm: "dialogue", stageDown: true }), round({ arm: "dialogue", satisfied: true })];
    expect(summariseArm("dialogue", rs, "gpt-5.6-luna").stageDowns).toBe(1);
  });

  it("`null` בדירוג אינו «לא» — הוא «טרם דורג»", () => {
    const rs = [
      round({ arm: "dialogue", intentCaptured: null }),
      round({ arm: "dialogue", intentCaptured: false }),
      round({ arm: "dialogue", intentCaptured: true, satisfied: true }),
    ];
    expect(summariseArm("dialogue", rs, "gpt-5.6-luna").intentCaptured).toEqual({ rated: 2, captured: 1 });
  });
});

describe("textUsd", () => {
  it("מודל שאינו בטבלה — null", () => {
    expect(textUsd({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }, "gpt-5.6-luna")).toBeNull();
  });
  it("בלי usage — null", () => {
    expect(textUsd(null, "deepseek-v4-flash")).toBeNull();
  });
});

describe("reportLab", () => {
  const session = (runId: string, baseHit: number | null, dlgHit: number | null): LabSession => ({
    runId,
    request: `בקשה ${runId}`,
    productType: "bracelet",
    rounds: [
      ...Array.from({ length: baseHit ?? 4 }, (_, i) => round({
        arm: "baseline" as const, satisfied: baseHit !== null && i === baseHit - 1,
      })),
      ...Array.from({ length: dlgHit ?? 4 }, (_, i) => round({
        arm: "dialogue" as const, satisfied: dlgHit !== null && i === dlgHit - 1,
        instruction: "Taper the outer contour and widen the openings, spaced evenly",
        attempts: 1,
      })),
    ],
  });

  it("הממוצע נלקח רק על בקשות שהוכרעו **בשתי** הזרועות", () => {
    // בקשה שרק המסלול החדש פתר היא הראיה החזקה ביותר שיש — ודווקא היא הייתה
    // מושכת את הממוצע של הישן למטה אם היו סופרים לו מספר או מדלגים רק אצלו.
    const r = reportLab([session("a", 5, 2), session("b", null, 1)], "gpt-5.6-luna");
    expect(r.total).toBe(2);
    expect(r.decided).toBe(1);
    expect(r.avgRounds.baseline).toBe(5);
    expect(r.avgRounds.dialogue).toBe(2);
  });

  it("הפרש הסבבים הוא מה שמדווח, לכל בקשה", () => {
    const r = reportLab([session("a", 5, 2)], "gpt-5.6-luna");
    expect(r.sessions[0].roundsSaved).toBe(3);
  });

  it("בקשה שלא הוכרעה בשתיהן — אין הפרש, ולא אפס", () => {
    const r = reportLab([session("b", null, 1)], "gpt-5.6-luna");
    expect(r.sessions[0].roundsSaved).toBeNull();
    expect(r.sessions[0].usdSaved).toBeNull();
    expect(r.avgRounds.baseline).toBeNull();
  });

  it("ציר התיאור הגרפי — ממוצע משוקלל לפי סבבים, לא ממוצע של ממוצעים", () => {
    // סשן עם סבב אחד וסשן עם חמישה אינם אותה עדות.
    const r = reportLab([session("a", 5, 2), session("b", 3, 1)], "gpt-5.6-luna");
    expect(r.instruction.graded).toBe(3);
    expect(r.instruction.avgCovered).toBeGreaterThan(0);
  });

  it("דוח ריק אינו קורס", () => {
    const r = reportLab([], "gpt-5.6-luna");
    expect(r.decided).toBe(0);
    expect(r.avgRounds.baseline).toBeNull();
    expect(r.firstParseRate).toBeNull();
  });
});

describe("blindOrder", () => {
  it("דטרמיניסטי — אותה בקשה, אותו סדר", () => {
    // דוח שאי אפשר לשחזר אינו דוח, וטסט על פונקציה אקראית אינו טסט.
    expect(blindOrder("פחות בלאגן פה")).toEqual(blindOrder("פחות בלאגן פה"));
  });

  it("שתי הזרועות תמיד, בלי כפילות", () => {
    for (const key of ["a", "b", "c", "פחות בלאגן", "יותר סימטרי", ""]) {
      const [first, second] = blindOrder(key);
      expect(new Set([first, second])).toEqual(new Set(["baseline", "dialogue"]));
    }
  });

  it("לא תמיד אותו סדר — אחרת אין עיוורון", () => {
    const keys = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const firsts = new Set(keys.map((k) => blindOrder(k)[0]));
    expect(firsts.size).toBe(2);
  });
});

describe("closureCoverage — כיסוי הסגירה (‏PROMPT_SPEC §7)", () => {
  it("שדות שנכתבו נספרים לפי מקורם; חסר-תיוג נקרא inferred", () => {
    const out = closureCoverage({
      outer_silhouette: "a band",
      negative_space: "seven slots",
      symmetry: "mirrored along the length",
      length_to_width_ratio: 8,
      sources: { negative_space: "user", symmetry: "chosen" },
    });
    expect(out.total).toBe(11);
    expect(out.decided).toBe(4);
    expect(out.bySource).toEqual({ user: 1, inferred: 2, chosen: 1 });
  });

  it("שדה חסר אינו «inferred חסר» — הוא דרגת חופש פתוחה", () => {
    const out = closureCoverage({ outer_silhouette: "a band" });
    expect(out.decided).toBe(1);
    expect(out.bySource.inferred).toBe(1);
  });

  it("מפרט ריק או חסר — אפס הכרעות, לא שגיאה", () => {
    for (const empty of [null, undefined, {}]) {
      expect(closureCoverage(empty).decided).toBe(0);
    }
  });

  it("יחס פסול אינו נספר כהכרעה", () => {
    expect(closureCoverage({ length_to_width_ratio: 0 }).decided).toBe(0);
  });
});

describe("dispersion — הפיזור של מדידה חוזרת (§1.4)", () => {
  it("ממוצע, סטיית תקן מדגמית ו-cv", () => {
    const d = dispersion([8, 10, 12]);
    expect(d.n).toBe(3);
    expect(d.mean).toBe(10);
    expect(d.sd).toBeCloseTo(2, 10);
    expect(d.cv).toBeCloseTo(0.2, 10);
  });

  it("ערכים חסרים נזרקים ואינם נספרים כאפס", () => {
    // הרצה שנפלה אינה "יחס 0" — ספירתה ככזה הייתה מנפחת את הפיזור בדיוק
    // כשהמדגם הכי רועש ממילא.
    const d = dispersion([8, null, undefined, NaN, 10, 12]);
    expect(d.n).toBe(3);
    expect(d.mean).toBe(10);
  });

  it("פחות משתי מדידות — אין פיזור, לא פיזור אפס", () => {
    expect(dispersion([]).mean).toBeNull();
    const one = dispersion([7]);
    expect(one.mean).toBe(7);
    expect(one.sd).toBeNull();
    expect(one.cv).toBeNull();
  });

  it("ממוצע אפס — cv לא מוגדר, לא אינסוף", () => {
    expect(dispersion([-1, 1]).cv).toBeNull();
  });

  it("מדידה זהה N פעמים — פיזור אפס אמיתי", () => {
    const d = dispersion([7, 7, 7, 7]);
    expect(d.sd).toBe(0);
    expect(d.cv).toBe(0);
  });
});

describe("interpretiveExcess — מה שמעל רצפת רעש הביצוע (§1.4)", () => {
  it("העודף מעל הרצפה — השונות הפרשנית, אשמת הפרומפט", () => {
    const sample = dispersion([8, 10, 12]);
    const floor = dispersion([9.5, 10, 10.5]);
    expect(interpretiveExcess(sample, floor)).toBeCloseTo(sample.cv! - floor.cv!, 10);
  });

  it("פיזור מתחת לרצפה — אפס, לא שלילי", () => {
    const tight = dispersion([10, 10, 10]);
    const floor = dispersion([9, 10, 11]);
    expect(interpretiveExcess(tight, floor)).toBe(0);
  });

  it("**בלי מדידת רצפה — null.** בלעדיה כל מספר אחידות חסר משמעות", () => {
    const sample = dispersion([8, 10, 12]);
    expect(interpretiveExcess(sample, dispersion([]))).toBeNull();
    expect(interpretiveExcess(dispersion([]), sample)).toBeNull();
  });
});

describe("summariseArm — סבבי respec", () => {
  it("נספרים רק עד שביעות הרצון, כמו כל השאר", () => {
    const rounds: LabRound[] = [
      round({ arm: "dialogue", respec: true, satisfied: false }),
      round({ arm: "dialogue", respec: true, satisfied: true }),
      round({ arm: "dialogue", respec: true, satisfied: null }),
    ];
    expect(summariseArm("dialogue", rounds, "gpt-5.6-luna").respecRounds).toBe(2);
  });

  it("זרוע בלי respec — אפס, כולל הזרוע הקיימת", () => {
    expect(summariseArm("baseline", [round({})], "gpt-5.6-luna").respecRounds).toBe(0);
  });
});
