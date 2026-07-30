import { describe, expect, it } from "vitest";
import { designCode } from "../designCode";

describe("designCode", () => {
  it("pads to four digits", () => {
    expect(designCode(1)).toBe("RM-0001");
    expect(designCode(42)).toBe("RM-0042");
  });

  it("does not truncate past four digits", () => {
    expect(designCode(12345)).toBe("RM-12345");
  });

  it("returns null when there is no serial", () => {
    // עיצוב שנוצר לפני המיגרציה, או שהתשובה מהשרת לא כללה את השדה. הקוראים
    // מסתמכים על null כדי להסתיר את השורה במקום להציג "RM-null".
    expect(designCode(null)).toBeNull();
    expect(designCode(undefined)).toBeNull();
    expect(designCode(0)).toBeNull();
    expect(designCode(Number.NaN)).toBeNull();
  });
});
