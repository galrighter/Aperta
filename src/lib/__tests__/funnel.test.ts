import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNNEL_EVENTS, FUNNEL_STEPS } from "@/lib/db/funnel";
import { normalizePath } from "@/lib/client/track";

// ראש המשפך. עד 15.8 לא היה שום נתון על מה שקורה לפני שנוצר עיצוב: כמה
// נכנסו, מאיפה, וכמה נטשו בדרך (docs/FULL_AUDIT_2026-08.md, פרק 6 §KPIs).
//
// שתי סכנות במדידה, ושתיהן נבדקות כאן: שהיא תפיל משהו אצל הלקוחה, ושהיא
// תשמור משהו שאסור לשמור.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const TRACK = read("src/lib/client/track.ts");
const ROUTE = read("src/app/api/events/route.ts");
const MIGRATION = read("supabase/migrations/0023_funnel_events.sql");

describe("חמשת השלבים", () => {
  it("לפי הסדר, ובלי share_view — הוא ערוץ כניסה ולא שלב", () => {
    expect(FUNNEL_STEPS).toEqual([
      "page_view",
      "design_start",
      "first_version",
      "checkout_view",
      "order_placed",
    ]);
    expect(FUNNEL_EVENTS).toContain("share_view");
    expect(FUNNEL_STEPS).not.toContain("share_view");
  });

  it("הרשימה סגורה גם במסד — אירוע חופשי הוא טבלה שאי אפשר לשאול", () => {
    for (const e of FUNNEL_EVENTS) expect(MIGRATION).toContain(`'${e}'`);
    expect(MIGRATION).toContain("check (event in (");
  });
});

describe("מה לא נשמר", () => {
  it("טוקן שיתוף אינו מגיע לטבלת האירועים", () => {
    // ‏/d/<token> הוא סוד: הטוקן הוא מה שפותח את העיצוב המשותף. שמירתו כאן
    // הייתה הופכת כל מי שקורא אנליטיקס למי שיכול לפתוח כל שיתוף.
    expect(normalizePath("/d/aB3xY9zQ7k")).toBe("/d/:token");
    expect(normalizePath("/d/aB3xY9zQ7k/render")).toBe("/d/:token/render");
  });

  it("נתיב רגיל עובר כמות שהוא", () => {
    expect(normalizePath("/design")).toBe("/design");
    expect(normalizePath("/")).toBe("/");
  });

  it("ה-query string נחתך בשרת ולא רק בדפדפן", () => {
    // פרמטרים נושאים מזהים, ומה שהדפדפן שולח אינו מה שהשרת חייב לשמור.
    expect(ROUTE).toContain('body.path.split("?")[0]');
  });

  it("מהמפנה נשמר ה-host בלבד", () => {
    expect(ROUTE).toContain("hostOf(body.referrer)");
    expect(ROUTE).toContain("new URL(referrer).host");
  });

  it("אין IP, אין user-agent ואין עוגייה בעמודות", () => {
    // רק ה-DDL: ההערות במיגרציה מסבירות דווקא **למה** אלה לא נשמרים, ולכן
    // הן מכילות את המילים עצמן.
    const ddl = MIGRATION.split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(ddl).not.toMatch(/\bip\b|ip_address|user_agent|cookie/i);
  });

  it("מזהה הביקור חי ב-sessionStorage ומת עם הלשונית", () => {
    expect(TRACK).toContain("sessionStorage");
    expect(TRACK).not.toContain("localStorage");
    expect(TRACK).not.toContain("document.cookie");
  });
});

describe("המדידה אינה מפילה דבר", () => {
  it("‏track עטוף ב-try/catch ובולע הכול", () => {
    expect(TRACK).toContain("export function track(");
    expect(TRACK).toMatch(/try \{[\s\S]*\} catch \{/);
  });

  it("‏sendBeacon כדי לשרוד את הניווט שקורה מיד אחרי ההזמנה", () => {
    expect(TRACK).toContain("navigator.sendBeacon");
    expect(TRACK).toContain("keepalive: true");
  });

  it("המסלול מוגבל בקצב — אירועים ציבוריים הם וקטור הצפה", () => {
    expect(ROUTE).toContain("tooManyAttempts(`event:");
  });
});
