import { describe, expect, it } from "vitest";
import {
  MIN_WIDTH_MM, RATIO_BAND, centerRatio, ratioBandFor, storyLayoutFor, storyNaturalRatio,
} from "../ratio";
import { askedRatiosOf, buildDesignPrompt, buildStagedRenderPrompt, type DesignSpec } from "../designStage";
import { LANDSCAPE, PORTRAIT } from "@/lib/render/canvas";
import { ratioChip } from "@/components/admin/RunsLog";

/**
 * story mode — היחס בין אורך לרוחב.
 *
 * במסלול הזה הרוחב נגזר מהיחס שהמודל צייר, ולכן **היחס הוא הרוחב**. עד 16.8
 * איש לא ביקש אותו: הפרומפט אמר "פרופורציות אמינות" והמודל הכריע. מה שיצא
 * נמדד — טבעת 8.5 ביחס 2.47 (25 מ"מ, מול טווח מוצר 4–18), צמיד ב-2.45
 * (65 מ"מ) — וזו הסיבה לכל מה שנבדק כאן.
 *
 * ארבע טענות:
 *  1. הטווח שמבקשים הוא של המוצר, והקצה הדק נחתך ברוחב המינימלי.
 *  2. התצורה נגזרת מהיחסים שהתבקשו, ולא להפך.
 *  3. הפרומפט באמת נושא את המספרים — גם לשלב הטקסט וגם למודל התמונה.
 *  4. חסר אינו כשל: מפרט בלי יחסים ממשיך לתצורה הקבועה.
 */

describe("הטווח שמותר לבקש", () => {
  it("לכל מוצר טווח משלו, מהרחב לדק", () => {
    expect(RATIO_BAND.ring).toEqual([2.9, 12.25]);
    expect(RATIO_BAND.bracelet).toEqual([2.4, 47.5]);
  });

  it("בפריט ארוך הטווח נשאר כפי שנקבע", () => {
    // צמיד 160.4: הקצה הדק נותן 3.4 מ"מ, מעל המינימום.
    expect(ratioBandFor("bracelet", 160.4)).toEqual([2.4, 47.5]);
  });

  it("בפריט קצר הקצה הדק נחתך — היחס משתנה, לא הרוחב", () => {
    // פרק יד קטן: פריסה 132 מ"מ. 132/47.5 = 2.78 מ"מ, מתחת ל-3.
    const [wide, thin] = ratioBandFor("bracelet", 132);
    expect(wide).toBe(2.4);
    expect(thin).toBe(44);
    // וזו ההגדרה: בקצה החדש הרוחב הוא בדיוק המינימום, לא פחות.
    expect(132 / thin).toBeCloseTo(MIN_WIDTH_MM, 1);
  });

  it("בטבעת הרצפה כמעט לא נוגעת — גם בקטנה שבטבלה", () => {
    // מידה 1, פריסה ~39.8 מ"מ: 39.8/12.25 = 3.25 מ"מ, עדיין מעל המינימום.
    expect(ratioBandFor("ring", 39.8)).toEqual([2.9, 12.25]);
  });

  it("בלי אורך — הטווח כמות שהוא", () => {
    expect(ratioBandFor("ring")).toEqual(RATIO_BAND.ring);
    expect(ratioBandFor("ring", 0)).toEqual(RATIO_BAND.ring);
  });
});

describe("התצורה נגזרת מהיחסים", () => {
  it("שורות = מספר העיצובים", () => {
    expect(storyLayoutFor([4, 6, 8]).rows).toBe(3);
    expect(storyLayoutFor([4, 5, 6, 7, 8]).rows).toBe(5);
  });

  it("מנה רחבה מקבלת את הקנבס שמושך רחב", () => {
    // מרכז 2.9: לאורך מבטיח 2.50, לרוחב 4.18. לאורך קרוב יותר.
    expect(storyLayoutFor([2.5, 2.9, 3.4]).canvas).toBe(PORTRAIT);
  });

  it("מנה דקה מקבלת את הקנבס שמושך דק", () => {
    expect(storyLayoutFor([4, 7, 11]).canvas).toBe(LANDSCAPE);
  });

  it("כשהקנבס לאורך כבוי — הכול לרוחב, כמו תמיד", () => {
    expect(storyLayoutFor([2.5, 2.9, 3.4], false).canvas).toBe(LANDSCAPE);
  });

  it("המרכז הוא חציון ולא ממוצע — דוגמה קיצונית אחת לא מזיזה את כולן", () => {
    // ממוצע 8.3 מול חציון 4. בלי החציון הבקשה ל"אחת דקה מאוד" הייתה גוררת
    // את התצורה של שלושתן.
    expect(centerRatio([3, 4, 18])).toBe(4);
    expect(storyLayoutFor([3, 4, 18]).canvas).toBe(LANDSCAPE);
  });

  it("יותר שורות מושכות דק יותר — וזה הקשר שהמסלול נשען עליו", () => {
    const three = storyNaturalRatio(3, LANDSCAPE);
    const six = storyNaturalRatio(6, LANDSCAPE);
    expect(six).toBeGreaterThan(three);
    // הכיול הדו-שלבי, מ-11 ההרצות ביומן: 1.16 + 0.67·יחס-התא.
    expect(three).toBeCloseTo(4.18, 2);
    expect(storyNaturalRatio(3, PORTRAIT)).toBeCloseTo(2.5, 2);
  });
});

describe("היחסים מגיעים לשני הפרומפטים", () => {
  it("שלב הטקסט מקבל את הטווח ואת דרישת הפיזור", () => {
    const p = buildDesignPrompt({
      productType: "ring",
      userInput: "השקט שאחרי",
      lengthMm: 61.7,
    });
    expect(p).toContain("1:2.9");
    expect(p).toContain("1:12.25");
    expect(p).toContain("length_to_width_ratio");
    expect(p).toContain("at least one design must be clearly NARROW");
    expect(p).toContain("differ by at least a factor of two");
    // ושום placeholder לא נשאר בטקסט שיוצא.
    expect(p).not.toMatch(/\{[A-Z_]+\}/);
  });

  const specOf = (ratios: number[]): DesignSpec => ({
    product_type: "bracelet",
    designs: ratios.map((r, i) => ({
      design_number: i + 1,
      length_to_width_ratio: r,
      image_instruction: `draw ${i + 1}`,
    })),
  });

  it("מודל התמונה מקבל מספר לכל שורה — וגם את ההשוואה ביניהן", () => {
    const spec = specOf([3, 6, 12]);
    const p = buildStagedRenderPrompt(JSON.stringify(spec), LANDSCAPE, spec);
    expect(p).toContain("DESIGN 1: length-to-width ratio 1:3");
    expect(p).toContain("DESIGN 3: length-to-width ratio 1:12");
    // ההשוואה היא מה שיש סיכוי שיפעל: מספר מוחלט נמדד כלא-משכנע (panels.ts),
    // והעמדה של שני פריטים זה מול זה באותו קנבס היא הוראה מסוג אחר.
    expect(p).toContain("DESIGN 3 is the narrowest and DESIGN 1 is the widest");
    expect(p).toContain("4 times thinner");
  });

  it("מספר השורות בפרומפט הוא מספר העיצובים במפרט", () => {
    const spec = specOf([4, 5, 6, 7, 8]);
    const p = buildStagedRenderPrompt(JSON.stringify(spec), LANDSCAPE, spec);
    expect(p).toContain("exactly FIVE");
    expect(p).toContain("DESIGN 1 — top row");
    expect(p).toContain("DESIGN 5 — bottom row");
    expect(p).not.toContain("DESIGN 6");
    expect(p).not.toMatch(/\{[A-Z_0-9]+\}/);
  });

  it("יחסים קרובים — בלי משפט ההשוואה, שאין לו מה לומר", () => {
    const spec = specOf([5, 5.2, 5.4]);
    const p = buildStagedRenderPrompt(JSON.stringify(spec), LANDSCAPE, spec);
    expect(p).toContain("DESIGN 2: length-to-width ratio 1:5.2");
    expect(p).not.toContain("times thinner");
  });
});

describe("מפרט בלי יחסים", () => {
  const bare: DesignSpec = {
    designs: [{ image_instruction: "a" }, { image_instruction: "b" }, { image_instruction: "c" }],
  };

  it("אינו כשל — פשוט אין מה למדוד", () => {
    expect(askedRatiosOf(bare)).toBeNull();
  });

  it("קבוצה חלקית נדחית — מרכז מחצי קבוצה אינו מרכז", () => {
    const half: DesignSpec = {
      designs: [
        { image_instruction: "a", length_to_width_ratio: 6 },
        { image_instruction: "b" },
      ],
    };
    expect(askedRatiosOf(half)).toBeNull();
  });

  it("ערך שאינו מספר חיובי נדחה", () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(askedRatiosOf({ designs: [{ image_instruction: "a", length_to_width_ratio: bad }] }))
        .toBeNull();
    }
  });

  it("והפרומפט לא ממציא מספרים במקומם", () => {
    const p = buildStagedRenderPrompt(JSON.stringify(bare), LANDSCAPE, bare);
    expect(p).not.toContain("length-to-width ratio 1:");
    expect(p).not.toMatch(/\{[A-Z_0-9]+\}/);
  });
});

describe("מה שהיומן מציג", () => {
  it("בהרצת Story: מה שביקשו, מה שהתצורה מבטיחה, ומה שיצא", () => {
    const chip = ratioChip({ askedRatios: [3, 6, 12], storyNaturalRatio: 4.18, drawnRatio: 4.1 });
    expect(chip?.text).toBe("ביקש 3 · 6 · 12 · תצורה 4.18 · צויר 4.1");
  });

  it("‏\"הוזמן\" ו\"תוכנן\" יורדים שם — הם לא אומרים כלום במסלול הזה", () => {
    // היחס שברשומה נגזר מעוגן תכנוני, והתכנון הישן מכויל לפרומפט של שלב אחד.
    const chip = ratioChip({
      askedRatios: [4, 8], storyNaturalRatio: 5, drawnRatio: 4.4,
      orderedRatio: 8.9, plannedRatio: 9.05,
    });
    expect(chip?.text).not.toContain("הוזמן");
    expect(chip?.text).not.toContain("תוכנן");
  });

  it("במסלול הרגיל שום דבר לא זז", () => {
    const chip = ratioChip({ orderedRatio: 8.9, plannedRatio: 9.05, drawnRatio: 6.5, stretch: 1.02 });
    expect(chip?.text).toBe("הוזמן 8.9:1 · תוכנן 9.05 · צויר 6.5 · מתיחה ×1.02");
  });

  it("הרצה בלי מדידה בכלל — אין תגית", () => {
    expect(ratioChip({})).toBeNull();
  });
});
