import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// כותרות האבטחה (docs/FULL_AUDIT_2026-08.md, פרק 2 — הקשחה: "אין CSP").
//
// אי אפשר לבדוק כותרות בלי לבנות ולהריץ, ולכן הבדיקות כאן קוראות את הקונפיג.
// מה שהן שומרות עליו הוא לא ה-CSP המושלם אלא ההבטחות שכן ניתנו: אם מישהו
// יסיר `frame-ancestors` או ירחיב את `default-src` ל-*, זה ייפול כאן.
//
// ה-CSP עצמו נבדק בדפדפן אמיתי (Chromium, 13 עמודים ציבוריים כולל ההדמיה
// התלת-ממדית) לפני שנכנס — בלי זה מדיניות אכיפה היא הימור.

const CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

describe("‏CSP", () => {
  it("חוסם עטיפה ב-iframe — clickjacking על הצ'קאאוט", () => {
    expect(CONFIG).toContain("frame-ancestors 'none'");
    // גם הכותרת הישנה, לדפדפנים שאינם מכירים את ההוראה.
    expect(CONFIG).toContain('key: "x-frame-options", value: "DENY"');
  });

  it("טופס אינו יכול להישלח ליעד חיצוני", () => {
    // בלי זה, XSS ששינה `action` שולח את הכתובת והטלפון של הלקוחה למקום אחר.
    expect(CONFIG).toContain("form-action 'self'");
  });

  it("‏base ו-object סגורים", () => {
    expect(CONFIG).toContain("base-uri 'self'");
    expect(CONFIG).toContain("object-src 'none'");
  });

  it("ברירת המחדל היא origin עצמו, ולא כוכבית", () => {
    expect(CONFIG).toContain('"default-src \'self\'",');
    // ‏`*` באיזו שהיא הוראה מבטל את הפואנטה. נבדק על ההוראות עצמן — שורות
    // המחרוזת — ולא על הקובץ, שההערות בו מכילות `*/`.
    const directives = CONFIG.split("\n")
      .map((l) => l.trim())
      .filter((l) => /^["`].*-src|^["`]default-src|^["`]form-action|^["`]base-uri/.test(l));
    expect(directives.length).toBeGreaterThan(5);
    for (const d of directives) expect(d).not.toContain("*");
  });

  it("הדומיינים החיצוניים נגזרים מהסביבה ולא נכתבים קשיח", () => {
    // דומיין שמשתנה בלי שה-CSP יידע הוא אתר שמפסיק להתחבר בלי הודעה.
    expect(CONFIG).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(CONFIG).toContain("supabaseOrigin");
  });

  it("‏'unsafe-eval' רק בפיתוח", () => {
    expect(CONFIG).toContain('process.env.NODE_ENV === "development"');
  });
});

describe("שאר הכותרות", () => {
  it("‏nosniff, ‏referrer מוגבל, ו-HSTS", () => {
    expect(CONFIG).toContain('key: "x-content-type-options", value: "nosniff"');
    // ‏/d/<token> הוא סוד, והוא היה נוסע ככותרת Referer לכל דומיין חיצוני.
    expect(CONFIG).toContain("strict-origin-when-cross-origin");
    expect(CONFIG).toContain("strict-transport-security");
  });

  it("הרשאות מכשיר סגורות — האתר לא מבקש מצלמה, מיקרופון או מיקום", () => {
    expect(CONFIG).toContain("camera=(), microphone=(), geolocation=()");
  });

  it("חלות על כל הנתיבים ולא על עמוד אחד", () => {
    expect(CONFIG).toContain('source: "/:path*"');
  });
});
