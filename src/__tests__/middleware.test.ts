import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "../middleware";
import { ADMIN_COOKIE } from "@/lib/admin";

// ההפניה כאן עומדת בין הבק־אופיס לבין מסווג ההונאה של Chrome, ומחיר הטעות
// בכיוון השני הוא שבירת האתר: אם היא תתפוס גם קריאות `fetch`, כל האפליקציה
// תקבל HTML של דף הבית במקום JSON. לכן כל ערך אפשרי של `Sec-Fetch-Mode` נבדק,
// ולא רק זה שאותו רצינו לחסום.

function req(path: string, headers: Record<string, string> = {}, cookie = false) {
  const host = headers.host ?? "aperta-designs.com";
  const r = new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } });
  if (cookie) r.cookies.set(ADMIN_COOKIE, "whatever");
  return r;
}

describe("שער הגלישה למסלולי API", () => {
  it("מפנה ניווט של דפדפן אל דף הבית", () => {
    const res = middleware(req("/api/debug/log", { "sec-fetch-mode": "navigate" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://aperta-designs.com/");
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

  it("אינו מסמן noindex על עמוד ציבורי, גם כשה-matcher מגיע אליו", () => {
    // ה-matcher נפרס על כל האתר בשביל הקנוניקל. אילו הכותרת הייתה נכתבת בלי
    // תנאי, השורה הזו הייתה מוחקת את האתר כולו ממנועי החיפוש.
    for (const path of ["/", "/gallery", "/design", "/faq"]) {
      const res = middleware(req(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Robots-Tag")).toBeNull();
    }
  });
});

// כניסה עם גוגל מ-`www` זרקה לדף הבית (4.8): `redirectTo` נבנה מ-
// `window.location.origin`, ו-GoTrue מחליף כתובת חזרה שאינה ב-`uri_allow_list`
// ב-`site_url`. מעבר לכך `www` ו-apex הם שני origins, כלומר שני עותקים נפרדים
// של הסשן, הטיוטה ורשימת העיצובים.
describe("origin קנוני", () => {
  const www = (path: string) => req(path, { host: "www.aperta-designs.com" });

  it("מפנה www אל הדומיין הראשי, קבוע ובלי לאבד את הנתיב", () => {
    const res = middleware(www("/design"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://aperta-designs.com/design");
  });

  it("שומר את ה-query — שם נוסע `next` של החזרה מגוגל", () => {
    const res = middleware(www("/auth/callback?next=%2Fdesign&code=abc"));
    expect(res.headers.get("location")).toBe(
      "https://aperta-designs.com/auth/callback?next=%2Fdesign&code=abc",
    );
  });

  it("תופס גם מסלול API, ולפני שער הגלישה", () => {
    // 308 שומר על השיטה והגוף, ולכן POST שהגיע ל-www שורד את המעבר.
    const res = middleware(www("/api/designs"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://aperta-designs.com/api/designs");
  });

  it("מניח לדומיין הראשי, ל-localhost ולתת-דומיין של פריסה", () => {
    for (const host of ["aperta-designs.com", "localhost:3000", "forme-studio.workers.dev"]) {
      expect(middleware(req("/design", { host })).status).toBe(200);
    }
  });

  it("חל על כל האתר — הקנוניקל מתחיל בעמוד הציבורי", () => {
    expect(config.matcher).toEqual(["/((?!_next/static|_next/image|favicon\\.ico).*)"]);
  });
});
