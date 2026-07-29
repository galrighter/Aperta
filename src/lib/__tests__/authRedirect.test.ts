import { describe, expect, it } from "vitest";
import { safeNext, withAuthFailed, DEFAULT_NEXT } from "../authRedirect";

describe("נתיב החזרה אחרי כניסה", () => {
  it("מכבד נתיב יחסי", () => {
    expect(safeNext("/design")).toBe("/design");
    expect(safeNext("/design?step=3")).toBe("/design?step=3");
  });

  it.each([
    ["https://evil.com", "כתובת מלאה"],
    ["//evil.com", "כתובת חסרת פרוטוקול — מתחילה בסלאש ובכל זאת יוצאת החוצה"],
    ["/\\evil.com", "בקסלאש שדפדפנים מנרמלים לסלאש"],
    ["javascript:alert(1)", "סכימה"],
  ])("דוחה %s (%s)", (raw) => {
    expect(safeNext(raw)).toBe(DEFAULT_NEXT);
  });

  it("נופל לברירת מחדל כשאין ערך", () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
  });

  it("מוסיף סימון כשל בלי לשבור query קיים", () => {
    expect(withAuthFailed("/design")).toBe("/design?auth=failed");
    expect(withAuthFailed("/design?step=3")).toBe("/design?step=3&auth=failed");
  });
});
