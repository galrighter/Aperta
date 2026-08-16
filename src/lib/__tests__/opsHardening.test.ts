import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FAB } from "@/lib/fabrication.config";
import { escapeLike } from "@/lib/db/orders";

// שלוש הקשחות תפעוליות מפרקים 1 ו-7 של האבחון. שתיים מהן (חיישן הקופסה,
// התקרה הגלובלית) אי אפשר להריץ כאן בלי קופסה ובלי מסד, ולכן הן נבדקות
// מהקוד — כמו `quotaGate.test.ts`. השלישית היא פונקציה טהורה.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const OPS = read("src/lib/opsStatus.ts");
const GENERATE = read("src/app/api/generate/route.ts");
const JOB_ROUTE = read("src/app/api/generate/[jobId]/route.ts");
const DUTY = read("src/lib/alerts/duty.ts");

describe("הקופסה נשאלת ישירות", () => {
  it("‏opsStatus קורא ל-/api/health ולא רק למסד", () => {
    // בלי זה הסטטוס יכול לדווח "הכול תקין" על מערכת שאינה מסוגלת לייצר.
    expect(OPS).toContain("/api/health");
    expect(OPS).toContain("box: OpsBoxHealth");
  });

  it("עם פסק זמן — הבדיקה יושבת בתוך בקשה שממתינים לה", () => {
    expect(OPS).toContain("AbortSignal.timeout(BOX_TIMEOUT_MS)");
  });

  it("ולא מפילה את הסטטוס כשהקופסה מתה", () => {
    // זה בדיוק המצב שהשדה נועד לדווח עליו.
    expect(OPS).toContain('status: "unreachable"');
  });
});

describe("התקרה הגלובלית ליצירה", () => {
  it("קיימת, ונמוכה בסדרי גודל מ-25,000 שהמכסה הפר-פרופילית מתירה", () => {
    expect(FAB.GLOBAL_DAILY_GENERATION_LIMIT).toBeGreaterThan(0);
    expect(FAB.GLOBAL_DAILY_GENERATION_LIMIT).toBeLessThan(1000);
  });

  it("גבוהה מהמכסה של משתמש יחיד — אחרת היא חוסמת לקוחה בודדת", () => {
    expect(FAB.GLOBAL_DAILY_GENERATION_LIMIT).toBeGreaterThan(FAB.DAILY_GENERATION_LIMIT);
  });

  it("נבדקת **אחרי** השריון, כדי שהבקשה הנוכחית תיספר", () => {
    // לפני השריון יש חלון שבו עשר בקשות מקבילות עוברות את אותה בדיקה.
    const reserve = GENERATE.indexOf("await reserveGeneration({");
    const global = GENERATE.indexOf("countTodayGenerationsGlobal()");
    expect(reserve).toBeGreaterThan(-1);
    expect(global).toBeGreaterThan(reserve);
  });

  it("‏fail-open על כשל ספירה — כשל אינו ראיה לחריגה", () => {
    expect(GENERATE).toContain("global generation count failed (allowing)");
  });

  it("מתריעה גם בהתקרבות, לא רק בחסימה", () => {
    expect(GENERATE).toContain('alertGlobalLimit(globalToday, "approaching")');
    expect(GENERATE).toContain('alertGlobalLimit(globalToday, "reached")');
    expect(FAB.GLOBAL_LIMIT_WARN_PCT).toBeGreaterThan(50);
    expect(FAB.GLOBAL_LIMIT_WARN_PCT).toBeLessThan(100);
  });
});

describe("מכסת המייל אינה נעקפת בשינוי אות", () => {
  it("תווי-דפוס בכתובת נחלצים", () => {
    // `%` ו-`_` חוקיים במייל; בלי בריחה `a_b@x.com` תופס גם את `axb@x.com`.
    expect(escapeLike("a_b@x.com")).toBe("a\\_b@x.com");
    expect(escapeLike("a%b@x.com")).toBe("a\\%b@x.com");
    expect(escapeLike("dana@x.com")).toBe("dana@x.com");
  });
});

describe("שאריות שנסגרו", () => {
  it("‏job בלי עיצוב אינו נענה לזרים", () => {
    expect(JOB_ROUTE).toContain("readAccountId(req)");
  });

  it("הטוקן של התורן מקבל את שני הכתיבים", () => {
    // שינוי חד-צדדי היה משתיק את התורן בשקט — התוצאה הגרועה ביותר לתיקון
    // קוסמטי.
    expect(DUTY).toContain("process.env.DUTY_API_TOKEN || process.env.DUTI_API_TOKEN");
  });

  it("קוד ה-LLM המת נמחק", () => {
    expect(() => read("src/lib/llm/pipeline.ts")).toThrow();
    expect(() => read("src/lib/llm/prompts.ts")).toThrow();
  });
});
