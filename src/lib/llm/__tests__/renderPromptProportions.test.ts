import { describe, expect, it } from "vitest";
import { NATURAL_RATIO } from "@/lib/render/panels";
import { buildRenderPrompt, retryPromptFor, RETRY_FRAMING } from "../imagegen";

/**
 * בלוק PROPORTIONS — מה נאמר על הצורה של הפריט, ומה נאמר על הלבן סביבו.
 *
 * **מה שנבדק כאן נולד מ-AP-0250** (17.8): צמיד 160.4×73, יחס 2.2. המודל צייר
 * פריט שנגע בגבול השמאלי של הקנבס, הניסיון החוזר עשה בדיוק אותו דבר, והלקוחה
 * קיבלה פריט שקצהו נחתך על ידי המסגרת. שני משפטים בפרומפט עבדו לכיוון הזה:
 *
 *  1. `long and narrow` — תיאור שאינו נכון על פריט ביחס 2.2, ושדוחף אותו לכיוון
 *     שהמודל ממילא נוטה אליו (הוא מצייר ~6.55 כשלא מצרים לו את התא).
 *  2. `leave plenty of plain white above and below it` — כימות של ציר אחד
 *     בלבד, דווקא לא זה שבו הפריט נחתך.
 *
 * שני הטסטים הראשונים מגנים על הסף; השלישי על הלבן, בשני המסלולים.
 */

const BRACELET = { thicknessMm: 1.5 };

describe("`long and narrow` נאמר רק כשהוא נכון על הפריט", () => {
  it("צמיד רגיל (יחס 8.9) — נאמר", () => {
    const p = buildRenderPrompt("קווים", "bracelet", { ...BRACELET, lengthMm: 160, widthMm: 18 });
    expect(p).toContain("that much room, long and narrow, and do not thicken it");
  });

  it("AP-0250 (יחס 2.2) — לא נאמר, והמשפט נשאר שלם", () => {
    const p = buildRenderPrompt("קורי עכביש", "bracelet", { ...BRACELET, lengthMm: 160.4, widthMm: 73 });
    expect(p).not.toContain("long and narrow");
    expect(p).toContain("2.2 times longer than it is wide");
    // מה שנשאר הוא בדיוק הנוסח של מסלול Story, שבו המילים לא היו מעולם.
    expect(p).toContain("that much room and do not thicken it");
  });

  it("הסף הוא היחס שהמודל מצייר לבדו על קנבס שלם — 6.55", () => {
    expect(NATURAL_RATIO(1, 1)).toBeCloseTo(6.55, 5);
    const above = buildRenderPrompt("x", "bracelet", { ...BRACELET, lengthMm: 66, widthMm: 10 });
    const below = buildRenderPrompt("x", "bracelet", { ...BRACELET, lengthMm: 65, widthMm: 10 });
    expect(above).toContain("long and narrow");
    expect(below).not.toContain("long and narrow");
  });
});

describe("הלבן נדרש בארבעת הכיוונים", () => {
  const ends = "leave plain white above and below it and beyond both of its ends";

  it("במסלול המידות", () => {
    const p = buildRenderPrompt("קווים", "bracelet", { ...BRACELET, lengthMm: 160, widthMm: 18 });
    expect(p).toContain(ends);
    expect(p).not.toContain("plenty");
  });

  it("ובמסלול Story, שבו הרוחב הוא של העיצוב", () => {
    const p = buildRenderPrompt(
      "הקיץ שליד הים", "bracelet", { ...BRACELET, lengthMm: 160.4, widthMm: 18 },
      3, false, false, 1, { widthRange: [3, 40] },
    );
    expect(p).toContain(ends);
    expect(p).not.toContain("plenty");
  });
});

/**
 * הפרומפט של הניסיון החוזר.
 *
 * הסבב השני נשלח היום זהה לראשון, ונמדד (17.8): מתוך 7 רנדרים שנחתכו הוא הציל
 * 3 ונכשל ב-4. מה שנוסף לו הוא משפט המסגור — ולא ניסוח חדש של הבקשה, כי אז
 * הסבב השני היה בודק משהו אחר ממה שהלקוחה ביקשה.
 */
describe("הניסיון החוזר מבקש משהו אחר", () => {
  it("נגזר מהפרומפט שנשלח, ולא נבנה מחדש", () => {
    const sent = buildRenderPrompt("קורי עכביש", "bracelet", { lengthMm: 160.4, widthMm: 73, thicknessMm: 1.5 });
    const retry = retryPromptFor(sent);
    expect(retry.startsWith(sent)).toBe(true);
    expect(retry).toContain("takes up about 80% of the image width");
  });

  it("גם על `promptOverride` מהבק־אופיס — מה שנבדק הוא מה שיחזור", () => {
    expect(retryPromptFor("anything at all")).toBe("anything at all" + RETRY_FRAMING);
  });
});
