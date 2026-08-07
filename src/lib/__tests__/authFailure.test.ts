import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyAuthError } from "@/lib/client/authFailure";

// התקלה שהולידה את הקובץ הזה: מפתח ה-SMTP של שירות האימות פג, `POST /otp`
// החזיר 500 על כל בקשה, וכל מי שביקש קוד במייל קיבל "הזיהוי נכשל. נסו שוב".
// הקוד עבד; המייל לא נשלח. ההודעה הזאת שלחה אנשים לנסות שוב עד שוויתרו, במקום
// להצביע על כניסת גוגל שעבדה כל אותו הזמן.

describe("סיווג כשל בשער הזיהוי", () => {
  it("500 הוא תקלת שרת ולא קלט שגוי", () => {
    // הצורה המדויקת שהוחזרה בייצור.
    expect(classifyAuthError({ status: 500, code: "unexpected_failure" })).toBe("server");
  });

  it("גם 4xx עם קוד `unexpected_failure` הוא תקלת שרת", () => {
    // הסטטוס לבדו לא תמיד מסגיר: ה-`code` הוא מה שהשירות באמת אמר.
    expect(classifyAuthError({ status: 400, code: "unexpected_failure" })).toBe("server");
  });

  it("429 ומגבלת שליחה הם המתנה, לא כישלון", () => {
    expect(classifyAuthError({ status: 429, code: undefined })).toBe("rate");
    expect(classifyAuthError({ status: 400, code: "over_email_send_rate_limit" })).toBe("rate");
  });

  it("בקשה שלא הגיעה לשרת היא תקלת תקשורת", () => {
    // `AuthRetryableFetchError` מגיע בלי סטטוס. בלי הענף הזה הוא היה נספר
    // כשגיאת קלט, כלומר הופך אובדן רשת ל"הקוד שהקלדתם שגוי".
    expect(classifyAuthError({ status: undefined, code: undefined })).toBe("network");
    expect(classifyAuthError({ status: 0, code: undefined })).toBe("network");
  });

  it("קוד שגוי נשאר קוד שגוי", () => {
    // 403 על `verifyOtp` הוא באמת המשתמשת. הסיווג לא אמור להסתיר גם את זה.
    expect(classifyAuthError({ status: 403, code: "otp_expired" })).toBe("other");
    expect(classifyAuthError({ status: 400, code: "validation_failed" })).toBe("other");
  });
});

describe("השער משתמש בסיווג", () => {
  const SRC = readFileSync(
    join(process.cwd(), "src/components/create/AccountGate.tsx"),
    "utf8",
  );

  it("שני מסלולי המייל מסווגים במקום לבלוע", () => {
    // עד כאן שניהם עשו `throw new Error(e.message)`, כלומר זרקו את `status`
    // ואת `code` — כל מה שמבדיל בין המקרים — לפני שמישהו הסתכל עליהם.
    // שניים ולא שלושה: כניסת גוגל נכשלת לפני שיצאה, ו-`acctGoogleFailed` כבר
    // מפנה למסלול השני.
    expect(SRC.match(/classifyAuthError\(e\)/g)?.length).toBe(2);
  });

  it("תקלת שליחה מפנה לגוגל", () => {
    // המסלול שכן עבד באותה תקלה עצמה.
    expect(SRC).toContain("d.acctMailDown");
    expect(readFileSync(join(process.cwd(), "src/i18n/he.ts"), "utf8")).toMatch(
      /acctMailDown:[\s\S]{0,200}Google/,
    );
  });

  it("השגיאה האמיתית נרשמת לקונסולה", () => {
    // בלי זה, האבחון הבא דורש שוב טוקן ניהול וחפירה בלוגים של שירות האימות.
    expect(SRC).toContain('console.error("signInWithOtp failed"');
    expect(SRC).toContain('console.error("verifyOtp failed"');
  });
});
