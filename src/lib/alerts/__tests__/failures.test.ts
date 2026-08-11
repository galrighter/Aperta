import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { LlmError } from "@/lib/llm/core";
import { isSystemicFailure } from "../failures";

// הרקע: בתרגיל התורן (11.8) טוקן שגוי מול קופסת הרנדר הפיל **כל** יצירה
// ב-401 — והשער הישן (`!(err instanceof ApiError)`) לא הזעיק איש, כי הכשל
// התגלגל לקוד המסודר render_failed. הטסטים מקבעים את הקריטריון החדש: קוד
// מסודר אינו חסינות מהזעקה; רק כשל שחזרתיות שלו לא מעידה על האתר מוחרג.

describe("מה מזעיק את התורן כשהוא חוזר", () => {
  it("כשל בלי קוד — מזעיק (המקרה המקורי של 10.8)", () => {
    expect(isSystemicFailure(new Error("Too many subrequests by single Worker invocation"))).toBe(true);
  });

  it("render_failed מזעיק — 401 גורף מהקופסה הוא תקלה מערכתית עם קוד מסודר", () => {
    expect(isSystemicFailure(new ApiError("render_failed", "Render service failed (401)", 502))).toBe(true);
    expect(isSystemicFailure(new ApiError("render_unreachable", "no route", 502))).toBe(true);
    expect(isSystemicFailure(new ApiError("render_timeout", "still working", 504))).toBe(true);
  });

  it("חסימת תוכן לא מזעיקה — דטרמיניסטית לתיאור, לא עדות על האתר", () => {
    expect(isSystemicFailure(new ApiError("content_blocked", "rejected by the safety system", 502))).toBe(false);
  });

  it("עומס חולף לא מזעיק", () => {
    expect(isSystemicFailure(new ApiError("render_busy", "the box is full", 502))).toBe(false);
  });

  it("תקציב לא מזעיק כאן — יש לו התראה ייעודית", () => {
    expect(isSystemicFailure(new ApiError("quota_exhausted", "insufficient_quota", 502))).toBe(false);
  });

  it("כשל מודל בודד לא מזעיק — הצינור מנסה שוב בעצמו", () => {
    expect(isSystemicFailure(new LlmError("model hiccup", true))).toBe(false);
  });
});
