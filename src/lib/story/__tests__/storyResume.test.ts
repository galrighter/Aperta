import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INITIAL, railIndex } from "@/components/create/model";
import { STORY_MODE, isStory } from "../mode";

/**
 * story mode — המסלול שורד חזרה לעיצוב שמור.
 *
 * **מה נשבר.** ‏`CreateState.story` חי בזיכרון העמוד בלבד, ו-`INITIAL.story`
 * הוא `false`. כל חזרה לעיצוב שמור נבנית על `INITIAL`, ולכן עיצוב שנוצר
 * במסלול Story חזר כעיצוב רגיל: מסך המידות ירד מהסרגל (הוא יושב שם **אחרי**
 * התוצאה), "בחר עיצוב" דילג מהתוצאה ישר לסיכום, וההזמנה יצאה באורך העוגן
 * שהרשומה נפתחה בו — 160 מ"מ בצמיד — בלי שאיש נשאל ובלי שום חיווי. זה בדיוק
 * הכשל ש-AP-0065 אוסר: מידה שאינה מדידה של הלקוחה, בשקט.
 *
 * מכאן המסלול נשמר על הרשומה (מיגרציה 0024) ונקרא ממנה בחזרה — ולא מהדפדפן:
 * הקישור מהמייל ו-`?resume=` נפתחים גם ממכשיר אחר.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const PAGE = read("src/app/(site)/design/page.tsx");

describe("המסלול נשמר על הרשומה", () => {
  it("היצירה מוסרת את המסלול לשרת", () => {
    // בלי זה אין מה לקרוא בחזרה — הרשומה נראית בדיוק כמו עיצוב רגיל.
    expect(PAGE).toContain("mode: st.story ? STORY_MODE : undefined");
  });

  it("החזרה קוראת אותו מהרשומה ולא מ-INITIAL", () => {
    expect(PAGE).toContain("const story = isStory(design.mode)");
    // ושתי הנחיתות — עיצוב עם תוצאה, ועיצוב שהיצירה שלו נקטעה — מקבלות אותו.
    expect(PAGE.match(/\n\s+story,\n/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("INITIAL עצמו לא זז — המסלול הרגיל הוא ברירת המחדל", () => {
    expect(INITIAL.story).toBe(false);
  });
});

describe("מה `mode` יכול להיות", () => {
  it("רק המחרוזת אחת מדליקה את המסלול", () => {
    expect(isStory(STORY_MODE)).toBe(true);
    expect(isStory("story")).toBe(true);
  });

  it("עיצוב רגיל, ועיצוב מלפני המיגרציה, נשארים במסלול הרגיל", () => {
    // `null` = עמודה קיימת וריקה; `undefined` = מסד שעוד לא קיבל את 0024.
    expect(isStory(null)).toBe(false);
    expect(isStory(undefined)).toBe(false);
    expect(isStory("")).toBe(false);
  });
});

describe("הצעד שנפתח בחזרה", () => {
  /**
   * `setMaxReached` מקבל **אינדקס בסרגל**, והסרגל שונה בין המסלולים. מספר קבוע
   * (3, כפי שהיה) פירושו שני דברים שונים בשני המסלולים: ברגיל הוא "עיצוב",
   * וב-Story הוא "סיכום" — כלומר הוא היה פותח מהסרגל את הצעד שבא **אחרי**
   * המידה, ומאפשר לעקוף אותה גם אחרי שהיא הוחזרה למסלול.
   */
  it("אותו מסך, אינדקס אחר בכל מסלול", () => {
    expect(railIndex(false, "result")).toBe(3);
    expect(railIndex(true, "result")).toBe(1);
    expect(railIndex(false, "brief")).toBe(2);
    expect(railIndex(true, "brief")).toBe(0);
  });

  it("החזרה משתמשת באינדקס של המסלול ולא במספר קבוע", () => {
    expect(PAGE).toContain('setMaxReached(railIndex(story, "result"))');
    expect(PAGE).toContain('setMaxReached(railIndex(story, "brief"))');
  });

  it("המידה נשארת מעבר למה שנפתח — היא נפתחת בלחיצה, לא מהסרגל", () => {
    // כמו ביצירה הראשונה: "בחר עיצוב" הוא מה שפותח את המידה.
    expect(railIndex(true, "sizes")).toBeGreaterThan(railIndex(true, "result"));
    expect(PAGE).toContain('go(s.story ? "sizes" : "summary")');
  });
});

describe("הדוגמה שנוצרת מבקשת שינוי", () => {
  it("יורשת את המסלול מעיצוב-האב", () => {
    // מאז 10.8 בקשת שינוי מייצרת עיצוב-דוגמה משלה, וההזמנה, המידה וכל בקשה
    // שאחריה מצביעות עליו. דוגמה בלי המסלול הייתה מחזירה את אותו כשל בדיוק,
    // רק על העיצוב שנוצר מהעריכה האחרונה.
    expect(read("src/lib/db/designs.ts")).toContain("...(base.mode ? { mode: base.mode } : {})");
  });
});
