import { describe, expect, it } from "vitest";
import { addressLineValid, nameValid, zipValid } from "../address";

describe("nameValid", () => {
  it("שם אמיתי עובר, בכל אלפבית", () => {
    expect(nameValid("דנה כהן")).toBe(true);
    expect(nameValid("Li")).toBe(true);
    expect(nameValid("  מיכל  ")).toBe(true);
  });

  it("מה שאינו שם נעצר", () => {
    expect(nameValid("")).toBe(false);
    expect(nameValid("ד")).toBe(false);
    expect(nameValid("12345")).toBe(false);
    expect(nameValid("..")).toBe(false);
  });
});

describe("addressLineValid", () => {
  it("רחוב עם מספר עובר, מספר לבדו לא", () => {
    expect(addressLineValid("הרצל 14")).toBe(true);
    expect(addressLineValid("14")).toBe(false);
  });
});

describe("zipValid", () => {
  it("ריק הוא תקין — זה שדה רשות", () => {
    expect(zipValid("")).toBe(true);
    expect(zipValid("   ")).toBe(true);
  });

  it("מיקוד ישראלי הוא שבע ספרות", () => {
    expect(zipValid("6100001")).toBe(true);
    expect(zipValid("61000")).toBe(false);
    expect(zipValid("61000012")).toBe(false);
  });

  it("מיקוד שאינו ספרות בלבד נמדד באורך סביר, כדי לא לפסול חו\"ל", () => {
    expect(zipValid("SW1A 1AA")).toBe(true);
    expect(zipValid("A1")).toBe(false);
  });
});
