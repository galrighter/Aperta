import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIALOGUE_MODE } from "../mode";

/**
 * dialogue mode — המסלול שורד את המסד, והכשל שורד את המסלול.
 *
 * **מה קרה בפועל** (הריצה החיה הראשונה, 20.8): ‏0024 קיבע
 * `check (mode in ('story'))`, ושלב B שלח `mode: 'dialogue'` לאותה עמודה.
 * ה-insert הפר את האילוץ, יצירת העיצוב החזירה 500, ואף שורה לא נכתבה
 * ליומן — הלקוחה קיבלה "היצירה נכשלה" לפני שהצינור התחיל בכלל. הנפילה-
 * לאחור ב-`/api/designs` תפסה רק "עמודה חסרה", לא הפרת אילוץ.
 *
 * הטסטים כאן הם קריאת-מקור בתבנית `storyResume.test.ts`: הם מקבעים את
 * שלושת הקצוות של התיקון, כי כל אחד מהם יכול להישבר בשקט בנפרד.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("האילוץ במסד מכיר את המסלול", () => {
  it("0029 מרחיב את designs_mode_check לשני המסלולים", () => {
    const sql = read("supabase/migrations/0029_design_mode_dialogue.sql");
    expect(sql).toContain("drop constraint if exists designs_mode_check");
    expect(sql).toContain("mode in ('story', 'dialogue')");
  });
});

describe("יצירת עיצוב אינה נופלת על ערך-מסלול שהמסד עוד לא מכיר", () => {
  const route = read("src/app/api/designs/route.ts");

  it("הנפילה-לאחור תופסת גם הפרת אילוץ, לא רק עמודה חסרה", () => {
    // בלי זה, מסד שקיבל את 0024 ולא את 0029 מחזיר 500 על כל יצירת dialogue —
    // בדיוק הכשל שנמדד. הרשומה נשמרת בלי המסלול: פחות טוב, לא חוסם.
    expect(route).toContain("designs_mode_check");
    expect(route).toContain("check constraint");
  });

  it("הסכמה מקבלת את שני המסלולים", () => {
    expect(route).toContain("DIALOGUE_MODE");
    expect(DIALOGUE_MODE).toBe("dialogue");
  });
});

describe("כשל יצירה במסלול חוזר לשיחה, לא לעורך", () => {
  it("הלקוחה מעולם לא הייתה בעורך — הכפתור מחזיר אותה לאן שבאה", () => {
    const page = read("src/app/(site)/design/page.tsx");
    // התווית והיעד יחד: תווית בלי ניווט הייתה משקרת, ניווט בלי תווית מפתיע.
    expect(page).toContain("dialogue.create.backToChat");
    expect(page).toContain('router.push("/dialogue/create")');
  });
});
