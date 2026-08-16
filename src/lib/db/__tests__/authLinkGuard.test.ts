import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ה-FK מ-`profiles.auth_user_id` ל-`auth.users` הוסר ב-0024, כי `auth.users`
// אינה בגיבוי ולכן השחזור לפרויקט חדש נכשל עליה. מה שנשאר מגן על אותו דבר
// עצמו — והבדיקות כאן שומרות שהוא לא ייעלם בשקט בעריכה עתידית.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const MIGRATION = read("supabase/migrations/0024_drop_auth_users_fk.sql");
const ACCOUNTS = read("src/lib/db/accounts.ts");
const OPS = read("src/lib/opsStatus.ts");

describe("מיגרציה 0024", () => {
  it("מסירה את ה-FK, ואינה נוגעת באינדקס הייחודי", () => {
    // האינדקס הוא מה שמונע שני פרופילים לאותו חשבון — כלומר ההגנה שבאמת
    // חשובה. ה-FK מעולם לא עשה את זה.
    expect(MIGRATION).toContain("drop constraint if exists profiles_auth_user_id_fkey");
    expect(MIGRATION).not.toMatch(/drop\s+index.*idx_profiles_auth_user/i);
  });

  it("אידמפוטנטית — migrate מריץ את כל הקבצים בכל פריסה", () => {
    expect(MIGRATION).toContain("if exists");
    expect(MIGRATION).toContain("create or replace function");
  });

  it("החיישן נועל search_path — security definer בלי נעילה הוא הסלמת הרשאות", () => {
    expect(MIGRATION).toContain("security definer");
    expect(MIGRATION).toContain("set search_path = public, auth");
  });

  it("לא נשענת על תפקידי Supabase, שאינם קיימים בהתקנה רגילה", () => {
    // `revoke ... from anon` מפיל את המיגרציה בכל שחזור ובכל בדיקה מקומית
    // עם `role "anon" does not exist`.
    const code = MIGRATION.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(code).not.toMatch(/\banon\b|\bauthenticated\b|\bservice_role\b/);
  });
});

describe("מה שהחליף את ה-FK", () => {
  it("‏linkAuthUser מתועד כנקודת האכיפה היחידה", () => {
    expect(ACCOUNTS).toContain("נקודת האכיפה היחידה");
  });

  it("החיישן נקרא בסטטוס התפעולי, ולא מפיל אותו", () => {
    // סטטוס תפעולי הוא מה שהתורן קורא כדי לדעת אם היצירה חיה. חיישן היגיינה
    // שמפיל אותו הוא החלפה של תקלה גדולה בקטנה.
    expect(OPS).toContain('sb.rpc("dangling_auth_links")');
    expect(OPS).toContain("danglingAuthLinks");
    expect(OPS).toContain("r.error ? null :");
  });

  it("'לא נמדד' ו-0 הם שתי תשובות שונות", () => {
    expect(OPS).toContain("danglingAuthLinks: number | null");
  });
});
