import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "../middleware";
import { ADMIN_COOKIE } from "@/lib/admin";

// ההפניה כאן עומדת בין הבק־אופיס לבין מסווג ההונאה של Chrome, ומחיר הטעות
// בכיוון השני הוא שבירת האתר: אם היא תתפוס גם קריאות `fetch`, כל האפליקציה
// תקבל HTML של דף הבית במקום JSON. לכן כל ערך אפשרי של `Sec-Fetch-Mode` נבדק,
// ולא רק זה שאותו רצינו לחסום.

function req(path: string, headers: Record<string, string> = {}, cookie = false) {
  const r = new NextRequest(`https://rmjewel.com${path}`, { headers });
  if (cookie) r.cookies.set(ADMIN_COOKIE, "whatever");
  return r;
}

describe("שער הגלישה למסלולי API", () => {
  it("מפנה ניווט של דפדפן אל דף הבית", () => {
    const res = middleware(req("/api/debug/log", { "sec-fetch-mode": "navigate" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://rmjewel.com/");
  });

  it.each(["cors", "same-origin", "no-cors", "websocket"])(
    "לא נוגע ב-fetch של האפליקציה (%s)",
    (mode) => {
      const res = middleware(req("/api/designs", { "sec-fetch-mode": mode }));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    },
  );

  it("לא נוגע בלקוח שאינו דפדפן ואינו שולח את הכותרת", () => {
    // ה-vectorizer ובדיקות CI מגיעות ככה. הפניה כאן הייתה מחזירה להן HTML.
    expect(middleware(req("/api/vectorize")).status).toBe(200);
  });

  it("מניח לאדמין מחובר לפתוח מסלול API ישירות", () => {
    const res = middleware(req("/api/debug/log", { "sec-fetch-mode": "navigate" }, true));
    expect(res.status).toBe(200);
  });

  it("אינו מפנה את עמודי הבק־אופיס עצמם — שם יושב טופס הכניסה", () => {
    for (const path of ["/admin", "/debug"]) {
      expect(middleware(req(path, { "sec-fetch-mode": "navigate" })).status).toBe(200);
    }
  });

  it.each(["/api/debug/log", "/admin", "/debug"])("מסמן %s כ-noindex", (path) => {
    expect(middleware(req(path)).headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("חל על שלושת העצים ולא על האתר הציבורי", () => {
    expect(config.matcher).toEqual(["/api/:path*", "/admin/:path*", "/debug/:path*"]);
  });
});
