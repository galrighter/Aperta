import { describe, expect, it } from "vitest";
import { formatPhone, isValidPhone, normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it("מסירה תווי עיצוב שאנשים באמת מקלידים", () => {
    expect(normalizePhone("050-123 4567")).toBe("0501234567");
    expect(normalizePhone("(03) 555.1234")).toBe("035551234");
  });

  it("מתרגמת קידומת ישראל לצורה אחת", () => {
    expect(normalizePhone("+972-50-1234567")).toBe("0501234567");
    expect(normalizePhone("+972 050 1234567")).toBe("0501234567");
    expect(normalizePhone("00972501234567")).toBe("0501234567");
  });

  it("מחזירה את מה שהוקלד גם כשאינו תקין, ולא מחרוזת ריקה", () => {
    expect(normalizePhone("050-12")).toBe("05012");
  });
});

describe("isValidPhone", () => {
  it("מקבלת נייד, קווי, וירטואלי ובין־לאומי", () => {
    expect(isValidPhone("050-1234567")).toBe(true);
    expect(isValidPhone("0521234567")).toBe(true);
    expect(isValidPhone("03-5551234")).toBe(true);
    expect(isValidPhone("072-2345678")).toBe(true);
    expect(isValidPhone("+972501234567")).toBe(true);
    expect(isValidPhone("+1 415 555 2671")).toBe(true);
  });

  it("פוסלת מה שאינו מספר טלפון", () => {
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("   ")).toBe(false);
    // קצר מדי, ארוך מדי, וקידומת שאינה קיימת
    expect(isValidPhone("050-123456")).toBe(false);
    expect(isValidPhone("05012345678")).toBe(false);
    expect(isValidPhone("011-1234567")).toBe(false);
    expect(isValidPhone("06-1234567")).toBe(false);
    // אותיות, ומספר שהוא בעצם מיקוד
    expect(isValidPhone("לא יודעת")).toBe(false);
    expect(isValidPhone("050-abc4567")).toBe(false);
    expect(isValidPhone("6100001")).toBe(false);
  });

  it("פוסלת בין־לאומי בלי + או בלי מספיק ספרות", () => {
    expect(isValidPhone("+0501234567")).toBe(false);
    expect(isValidPhone("+1234567")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("מציגה צורה אחת לכל דרכי ההקלדה", () => {
    expect(formatPhone("0501234567")).toBe("050-1234567");
    expect(formatPhone("+972 50 123 4567")).toBe("050-1234567");
    expect(formatPhone("035551234")).toBe("03-5551234");
    expect(formatPhone("+1 415 555 2671")).toBe("+14155552671");
  });

  it("לא מעצבת מספר שגוי — עיצוב גורם לו להיראות נכון", () => {
    expect(formatPhone("050-12")).toBe("050-12");
  });
});
