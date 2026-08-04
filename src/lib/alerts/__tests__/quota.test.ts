import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { isQuotaFailure } from "../quota";
import { quotaAlertMail } from "@/lib/mailTemplates";

// הרקע: ב-30.7.26 נגמר התקציב ב-OpenAI וכל יצירה נכשלה. השגיאה שנרשמה ביומן
// הייתה "Render service returned non-JSON (502): error code: 502" — כלומר עמוד
// שגיאה של Cloudflare, בלי זכר לסיבה. הטסטים כאן שומרים על שני הצדדים של
// התיקון: שהסיבה מזוהה, ושמי שקורא את המייל יודע מה לעשות.

describe("זיהוי תקציב שנגמר", () => {
  it("מזהה את הקוד שהקופסה מחזירה", () => {
    expect(isQuotaFailure(new ApiError("quota_exhausted", "gpt-image-1-mini: 429", 502))).toBe(true);
  });

  it("מזהה גם מהודעת הספק עצמה", () => {
    // רשת ביטחון: קופסה שעוד לא נפרסה מחזירה RENDER_FAILED רגיל, וההודעה היא
    // כל מה שנשאר כדי לדעת שזה תקציב.
    const raw = 'Image generation failed. gpt-image-1-mini: 429 {"error":{"code":"insufficient_quota"}}';
    expect(isQuotaFailure(new Error(raw))).toBe(true);
    expect(isQuotaFailure(new Error("billing_hard_limit_reached"))).toBe(true);
  });

  it("לא מזהה מגבלת קצב רגילה", () => {
    // 429 מרוב בקשות חולף מעצמו. מייל עליו הוא מייל שילמדו להתעלם ממנו, וביום
    // שהתקציב באמת ייגמר אף אחד לא יסתכל.
    expect(isQuotaFailure(new Error('429 {"error":{"code":"rate_limit_exceeded"}}'))).toBe(false);
  });

  it("לא מזהה כשל תשתית", () => {
    const gateway = new ApiError("render_bad_response", "Render service returned non-JSON (502)", 502);
    expect(isQuotaFailure(gateway)).toBe(false);
  });

  it("לא נופל על שגיאה שאינה Error", () => {
    expect(isQuotaFailure(null)).toBe(false);
    expect(isQuotaFailure(undefined)).toBe(false);
    expect(isQuotaFailure("insufficient_quota")).toBe(true);
  });
});

describe("מייל ההתראה", () => {
  const mail = quotaAlertMail({
    reason: 'Image generation failed. gpt-image-1-mini: 429 {"error":{"code":"insufficient_quota"}}',
    runId: "0d9f0f5e-1111-2222-3333-444455556666",
    designRef: "AP-0054",
  });

  it("אומר בכותרת מה קרה, לא איזה שירות נפל", () => {
    // הכותרת היא לעיתים כל מה שנקרא — ברשימת המיילים בנייד.
    expect(mail.subject).toContain("תקציב");
  });

  it("נושא את הודעת הספק כמו שהיא", () => {
    // בלעדיה אי אפשר להבדיל בין תקציב שנגמר לבין תקלה שנוסחה דומה.
    expect(mail.text).toContain("insufficient_quota");
  });

  it("מקשר את ההתראה ליומן ולעיצוב", () => {
    expect(mail.text).toContain("AP-0054");
    expect(mail.text).toContain("0d9f0f5e-1111-2222-3333-444455556666");
  });

  it("אומר מה לעשות", () => {
    expect(mail.text).toContain("OpenAI");
  });

  it("עובד גם בלי מספר עיצוב", () => {
    const anonymous = quotaAlertMail({ reason: "insufficient_quota", runId: "abc", designRef: null });
    expect(anonymous.text).not.toContain("null");
  });
});
