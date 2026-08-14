import { describe, expect, it } from "vitest";
import { LANDSCAPE, PORTRAIT } from "@/lib/render/canvas";
import { buildRenderPrompt } from "@/lib/llm/imagegen";
import { buildStoryRenderPrompt } from "../prompt";

/**
 * story mode — הפרומפט של המסלול הפשוט.
 *
 * שלוש קבוצות טענות, ובכוונה רק שלוש:
 *  1. **הסיפור הוא הקלט** — הוא נכנס כמו שנכתב, והפרומפט מבקש לתרגם אותו
 *     לצורה ולא לצייר אותו.
 *  2. **מה שהצינור חייב** ממשיך להיאמר: שחור מלא על לבן שטוח בלי צל/גרדיאנט
 *     (הפרדה לווקטורייזר), פריט אחד מחובר מגיליון יחיד (ייצור), ומספר
 *     הפריטים שהתכנון קבע (מה שנחתך בפועל).
 *  3. **המידות יצאו** — אין כאן אורך, רוחב או יחס במ"מ. המידה נכנסת אחרי
 *     התוצאה, בשלב ההזמנה, כשהעיצוב ממוסגר מחדש (`storyFrameDims`).
 *
 * ומעל הכול: הטסט האחרון כאן בודק שהמסלול הקיים לא זז.
 */

const STORY = "הקיץ שהיינו נוסעים בכל ערב לים.";

describe("buildStoryRenderPrompt", () => {
  it("הסיפור נכנס כמו שנכתב, כקלט לפרשנות ולא כאיור", () => {
    const p = buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3 });
    expect(p).toContain(STORY);
    expect(p).toContain("Interpret this input as the creative source");
    expect(p).toContain("Do not illustrate the story literally");
    expect(p).toContain("translate the story into form");
  });

  it("רווחים ורווחי שורה בסיפור מתקפלים לשורה אחת", () => {
    const p = buildStoryRenderPrompt({
      story: "  שורה ראשונה\n\n   שורה שנייה  ",
      productType: "ring",
      rows: 2,
      cols: 2,
    });
    expect(p).toContain('"שורה ראשונה שורה שנייה"');
    expect(p).not.toContain("\n");
  });

  it("נשאר רק שם המוצר הנכון — האפשרות השנייה נמחקת", () => {
    const cuff = buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3 });
    expect(cuff).toContain("open cuff bracelet");
    expect(cuff).not.toContain("open ring");
    // ופסקת הפרופורציות — רק המשפט של המוצר שנבחר
    expect(cuff).toContain("length should clearly be much greater than the width");
    expect(cuff).not.toContain("realistic flat-ring proportions");

    const ring = buildStoryRenderPrompt({ story: STORY, productType: "ring", rows: 2, cols: 2 });
    expect(ring).toContain("open ring");
    expect(ring).not.toContain("open cuff bracelet");
    expect(ring).toContain("realistic flat-ring proportions");
    expect(ring).not.toContain("length should clearly be much greater than the width");
  });

  it("מספר הפריטים הוא מה שהתכנון חותך, לא מספר קבוע בטקסט", () => {
    expect(buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3 }))
      .toContain("exactly three separate flat jewelry blanks");
    expect(buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 5 }))
      .toContain("exactly five separate flat jewelry blanks");
    // רשת: המכפלה, וגם צורת הרשת עצמה
    const grid = buildStoryRenderPrompt({ story: STORY, productType: "ring", rows: 2, cols: 2 });
    expect(grid).toContain("exactly four separate flat jewelry blanks");
    expect(grid).toContain("two evenly spaced horizontal rows by two evenly spaced vertical columns");
  });

  it("פריט יחיד: בלי פסקת מגוון ובלי שפה של שורות", () => {
    const one = buildStoryRenderPrompt({ story: STORY, productType: "ring", rows: 1 });
    expect(one).toContain("exactly one flat jewelry blank");
    expect(one).not.toContain("DESIGN VARIATION");
    expect(one).not.toContain("horizontal rows");
  });

  it("צורת הקנבס שנאמרת היא זו שתתבקש בפועל", () => {
    expect(buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3, canvas: PORTRAIT }))
      .toContain("portrait / tall canvas");
    expect(buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3, canvas: LANDSCAPE }))
      .toContain("landscape / wide canvas");
  });

  it("מה שהווקטורייזר צריך ממשיך להיאמר", () => {
    const p = buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3 });
    expect(p).toContain("pure white background");
    expect(p).toContain("jewelry material shown as solid black");
    expect(p).toContain("zero gradient");
    expect(p).toContain("zero cast shadow");
    expect(p).toContain("BLACK = METAL THAT REMAINS, WHITE = MATERIAL REMOVED BY LASER");
    expect(p).toContain("straight overhead orthographic view");
  });

  it("אילוץ הייצור: גיליון אחד, פריט אחד מחובר, בעובי שנמסר", () => {
    const p = buildStoryRenderPrompt({
      story: STORY, productType: "bracelet", rows: 3, thicknessMm: 1.5,
    });
    expect(p).toContain("one single flat sheet of 1.5mm brass");
    expect(p).toContain("single connected manufacturable piece");
    expect(p).toContain("No soldering.");
    expect(p).toContain("No floating or disconnected elements.");
  });

  it("אין מידות במ\"מ ואין יחס — המידה נכנסת רק בשלב ההזמנה", () => {
    const p = buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3 });
    expect(p).not.toContain("PROPORTIONS (this is a measurement");
    expect(p).not.toMatch(/\d+(\.\d+)?mm long/);
    expect(p).not.toMatch(/times longer than it is wide/);
    // מה שכן נאמר על פרופורציה הוא איכותי בלבד
    expect(p).toContain("believable flat proportions");
  });

  it("המגוון נדרש במפורש כשיש בין מה למה", () => {
    const p = buildStoryRenderPrompt({ story: STORY, productType: "bracelet", rows: 3 });
    expect(p).toContain("DESIGN VARIATION");
    expect(p).toContain("Do not create three nearly identical versions");
  });
});

describe("המסלול הקיים אינו זז", () => {
  it("`buildRenderPrompt` בלי story ממשיך למסור מידות ויחס", () => {
    const p = buildRenderPrompt("צמיד עם קווים", "bracelet", {
      lengthMm: 160, widthMm: 18, thicknessMm: 1.5,
    }, 3);
    expect(p).toContain("PROPORTIONS (this is a measurement, not a style)");
    expect(p).toContain("160mm long and 18mm wide");
    expect(p).not.toContain("Aperta");
    expect(p).not.toContain("USER INPUT");
  });
});
