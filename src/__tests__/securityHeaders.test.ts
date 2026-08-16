import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCsp, supabaseOrigin } from "@/lib/csp";

// כותרות האבטחה (docs/FULL_AUDIT_2026-08.md, פרק 2 — הקשחה: "אין CSP").
//
// עד 16.8 הבדיקות כאן קראו את `next.config.ts` כטקסט וחיפשו בו מחרוזות: אי
// אפשר לבדוק כותרות בלי לבנות ולהריץ, ובקונפיג — שנטען עם
// `initOpenNextCloudflareForDev` — אי אפשר היה לגעת. חיפוש טקסט מוודא שההוראה
// **כתובה**, לא שהיא **נבנית**: `img-src` היה כתוב שם כל הזמן, בלי ה-storage,
// וארבע בדיקות ירוקות לא ראו את זה. מאז שהמדיניות היא פונקציה (`lib/csp`)
// הבדיקות רצות על המחרוזת עצמה. הקריאה כטקסט נשארה רק לכותרות שבאמת חיות
// בקונפיג.
//
// ה-CSP עצמו נבדק בדפדפן אמיתי (Chromium, 13 עמודים ציבוריים כולל ההדמיה
// התלת-ממדית) לפני שנכנס — בלי זה מדיניות אכיפה היא הימור.

const CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

const ORIGIN = "https://abcdefgh.supabase.co";
const CSP = buildCsp({ origin: ORIGIN });

const directive = (csp: string, name: string): string =>
  csp.split("; ").find((d) => d === name || d.startsWith(`${name} `)) ?? "";

describe("‏CSP", () => {
  it("חוסם עטיפה ב-iframe — clickjacking על הצ'קאאוט", () => {
    expect(directive(CSP, "frame-ancestors")).toBe("frame-ancestors 'none'");
    // גם הכותרת הישנה, לדפדפנים שאינם מכירים את ההוראה.
    expect(CONFIG).toContain('key: "x-frame-options", value: "DENY"');
  });

  it("טופס אינו יכול להישלח ליעד חיצוני", () => {
    // בלי זה, XSS ששינה `action` שולח את הכתובת והטלפון של הלקוחה למקום אחר.
    expect(directive(CSP, "form-action")).toBe("form-action 'self'");
  });

  it("‏base ו-object סגורים", () => {
    expect(directive(CSP, "base-uri")).toBe("base-uri 'self'");
    expect(directive(CSP, "object-src")).toBe("object-src 'none'");
  });

  it("ברירת המחדל היא origin עצמו, ולא כוכבית", () => {
    expect(directive(CSP, "default-src")).toBe("default-src 'self'");
    // ‏`*` באיזו שהיא הוראה מבטל את הפואנטה.
    for (const d of CSP.split("; ")) expect(d).not.toContain("*");
  });

  /**
   * הבאג שהבדיקה הזו נועדה לתפוס (16.8).
   *
   * ההקשחה כתבה `img-src 'self' data: blob:` בלי ה-storage של Supabase, וכל
   * תמונה בבק־אופיס נחסמה. התמונות אינן מוגשות מהדומיין שלנו: מסלול התמונה של
   * היומן (`/api/debug/log/<id>/image/<name>`) מחזיר 302 לכתובת חתומה,
   * והסטודיו ומעבדת ההרצה מקבלים כתובת חתומה כמו שהיא. ‏CSP נבדק מחדש על יעד
   * ההפניה — כלומר הבקשה אושרה והתשובה נזרקה. התוצאה הייתה יומן יצירות עם
   * ריבוע שבור בכל שורה, בלי שגיאה בשרת ובלי שורה בלוג.
   */
  it("מתיר תמונות מה-storage — זה מה שיומן היצירות והסטודיו טוענים", () => {
    expect(directive(CSP, "img-src")).toBe(`img-src 'self' data: blob: ${ORIGIN}`);
  });

  it("מתיר חיבור ל-Supabase — האימות מהדפדפן", () => {
    expect(directive(CSP, "connect-src")).toContain(ORIGIN);
  });

  it("הדומיינים החיצוניים נגזרים מהסביבה ולא נכתבים קשיח", () => {
    // דומיין שמשתנה בלי שה-CSP יידע הוא אתר שמפסיק להתחבר בלי הודעה.
    expect(CONFIG).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(supabaseOrigin(`${ORIGIN}/rest/v1`)).toBe(ORIGIN);
    expect(supabaseOrigin(undefined)).toBe("");
    expect(supabaseOrigin("not-a-url")).toBe("");
  });

  it("סביבה בלי Supabase — מדיניות תקינה, לא מקור ריק בין רווחים", () => {
    const none = buildCsp({ origin: "" });
    expect(directive(none, "img-src")).toBe("img-src 'self' data: blob:");
    expect(none).not.toContain("  ");
    expect(none).not.toContain("; ;");
  });

  it("‏'unsafe-eval' רק בפיתוח", () => {
    expect(directive(CSP, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp({ origin: ORIGIN, dev: true }), "script-src")).toContain("'unsafe-eval'");
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
