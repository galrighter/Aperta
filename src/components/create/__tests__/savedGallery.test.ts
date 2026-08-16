import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { previewFrame, pathBounds } from "../savedPreview";
import { clampPage, pageCount, pageItems, SAVED_PAGE_SIZE } from "../savedPaging";

// "בתוך העיצובים שלי לא רואים את כל הפריט, ויש תקרה של 30" — 14.8, מאנדרואיד.
//
// שני דברים נפרדים, ושניהם מסתירים עיצובים קיימים:
//
// 1. **הציור נחתך.** הכרטיס בנה `viewBox` מהמידות שהוזמנו, בזמן שה-path חי
//    במסגרת שהגרסה באמת יושבת בה (זו שנקראת מה-viewBox שלה בשרת). כל הפרש
//    בין השתיים נגזם בשורש ה-SVG — ומה שנשאר על המסך הוא קטע מוגדל של הפריט.
// 2. **התקרה.** האינדקס המקומי שמר 30 רשומות. הסנכרון מהחשבון מושך את כולן,
//    והשאר נחתכו בשקט — בלי שום סימן שהן קיימות.

const SRC = join(process.cwd(), "src");
// הכרטיס חולץ לקובץ משלו כשדף /designs נולד — הבדיקות עוקבות אחריו לשם.
const CARD = readFileSync(join(SRC, "components/create/SavedDesignCard.tsx"), "utf8");
const LIST = readFileSync(join(SRC, "components/create/SavedDesigns.tsx"), "utf8");
const STORE = readFileSync(join(SRC, "lib/client/myDesigns.ts"), "utf8");

describe("מסגרת הציור של הכרטיס", () => {
  it("מכילה את הציור גם כשהוא רחב מהמידות שנשמרו", () => {
    // בדיוק המקרה שנראה על המסך: הרשומה אומרת רוחב 18, והציור יושב על 26.
    const path = "M0,0L155,0L155,26L0,26Z";
    const { viewBox } = previewFrame(path, 155, 18);
    const [x, y, w, h] = viewBox.split(" ").map(Number);
    expect(x).toBeLessThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(0);
    expect(x + w).toBeGreaterThanOrEqual(155);
    expect(y + h).toBeGreaterThanOrEqual(26);
  });

  it("שומרת על המלבן שהוזמן גם כשהציור קטן ממנו", () => {
    // חיתוך יחיד בקצה אינו "סוף הפריט" — הרצועה נמשכת עד המידה שהוזמנה.
    const { viewBox } = previewFrame("M0,0L10,0L10,4L0,4Z", 150, 12);
    const [x, y, w, h] = viewBox.split(" ").map(Number);
    expect(x + w).toBeGreaterThanOrEqual(150);
    expect(y + h).toBeGreaterThanOrEqual(12);
  });

  it("היחס נגזר מהמסגרת, כדי שתיבת הכרטיס תהיה בגובה של הפריט", () => {
    expect(previewFrame("M0,0L100,0L100,10L0,10Z", 100, 10).ratio).toBeCloseTo(102 / 12, 5);
  });

  it("path בלי זוג קואורדינטות שלם אינו מפיל את החישוב", () => {
    expect(pathBounds("")).toBeNull();
    expect(previewFrame("", 150, 12).viewBox).toBe("-1 -1 152 14");
  });

  it("ה-SVG נכנס לתיבה בשלמותו — meet, ולא חיתוך", () => {
    // בלי זה גם מסגרת נכונה נחתכת: ציור גבוה מהתיבה גולש מתחת ל-overflow-hidden.
    expect(CARD).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(CARD).not.toContain('className="h-auto w-full"');
  });

  it("הרוחב לציור הוא המסגרת, והרוחב לכיתוב הוא מה שהוזמן", () => {
    expect(CARD).toContain("it.frameWidthMm ?? it.widthMm");
    expect(CARD).toMatch(/\{it\.widthMm\} \{d\.mm\}/);
  });

  it("הכרטיס נכנס ברוחב העמודה — גם ברצועה ארוכה", () => {
    // "עדיין עיצוב לא נכנס בחלון וצריך לגלול לצדדים" — מאנדרואיד.
    //
    // תיבת הציור נושאת `aspect-ratio` יחד עם `minHeight`, והדפדפן מעביר את
    // רצפת הגובה דרך היחס אל **מינימום רוחב**. פריט ברשת הוא
    // `min-width: auto` כברירת מחדל, ולכן הכרטיס נמתח לרוחב שהתוכן "דורש":
    // צמיד 170×25 הוא יחס 6.4, כלומר 64px × 6.4 ≈ 410px בעמודה של 345px.
    // `overflow-y-auto` על הרשימה הופך גם את הציר האופקי לגליל, וזו בדיוק
    // הגלילה הצידה שנראתה על המסך.
    const ratio = previewFrame("M0,0L170,0L170,25L0,25Z", 170, 25).ratio;
    expect(ratio).toBeGreaterThan(5);
    expect(CARD).toMatch(/<li[^>]*className="flex min-w-0 flex-col/);
  });

  it("כל תוצאה מצוירת במסגרת של עצמה", () => {
    expect(CARD).toContain("r.widthMm ?? frameW");
    expect(CARD).toContain("r.lengthMm ?? it.lengthMm!");
  });
});

describe("העימוד", () => {
  const items = Array.from({ length: 47 }, (_, i) => ({ id: `d${i}` }));

  it("מציג את כל העיצובים, עמוד אחרי עמוד", () => {
    const seen = new Set<string>();
    for (let p = 0; p < pageCount(items.length); p++) {
      for (const it of pageItems(items, p)) seen.add(it.id);
    }
    expect(seen.size).toBe(47);
  });

  it("עמוד מלא הוא בגודל עמוד, והאחרון הוא השארית", () => {
    expect(pageItems(items, 0)).toHaveLength(SAVED_PAGE_SIZE);
    expect(pageItems(items, 3)).toHaveLength(47 - 3 * SAVED_PAGE_SIZE);
  });

  it("עמוד שהתרוקן בהסרה מוחזר לאחרון שקיים", () => {
    // אחרת נשארים על "עמוד 4 מתוך 3" — רשימה ריקה בלי שום הסבר.
    expect(clampPage(3, 47)).toBe(3);
    expect(clampPage(3, 24)).toBe(1);
    expect(clampPage(0, 0)).toBe(0);
  });

  it("רשימה ריקה היא עמוד אחד ולא אפס", () => {
    expect(pageCount(0)).toBe(1);
  });

  it("רק הכרטיסים שנראים מבקשים ציור מהשרת", () => {
    // חמישים עיצובים הם חמישים בקשות מטלפון, ורובן עבור עמוד שאיש לא פתח.
    expect(LIST).toContain("onOpen?.(visibleIds ? visibleIds.split(\",\") : [])");
  });
});

describe("הסנכרון מהחשבון", () => {
  const PAGE = readFileSync(join(SRC, "app/(site)/design/page.tsx"), "utf8");

  it("רץ בכל טעינה שיש בה חשבון, ולא רק ברגע הכניסה", () => {
    // מי שנכנסה פעם אחת ונשארה מחוברת ראתה לנצח את הרשימה שהייתה לה אז —
    // כולל את מה שנחתך בתקרה הישנה ולא חזר.
    expect(PAGE).toContain("if (a) void syncFromAccount();");
  });

  it("ממזג בכתיבה אחת ולא רשומה-רשומה", () => {
    // `mergeMyDesign` בלולאה הוא ריבועי: כל צעד קורא וכותב את כל האינדקס.
    expect(PAGE).toContain("mergeMyDesigns(");
    expect(PAGE).not.toMatch(/for \(const dz of designs\)/);
  });
});

describe("התקרה של האחסון", () => {
  it("אינה 30", () => {
    expect(STORE).not.toMatch(/const MAX = 30\b/);
  });

  it("כתיבה שנתקלת במכסה משילה ציורים לפני שהיא מוותרת על רשומות", () => {
    // הציור נמשך שוב מהשרת; רשומה שנמחקה היא עיצוב שנעלם מהרשימה.
    expect(STORE).toContain("const undrawn =");
  });
});
