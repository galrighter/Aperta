import { describe, it, expect } from "vitest";
import { versionEntryLabel, type EditEntry } from "../model";
import { he } from "@/i18n/he";

const d = he.design;

const entry = (text: string): EditEntry => ({
  versionId: "v", versionNo: 1, lengthMm: null, region: null,
  text, svg: "", report: null, geometry: null,
});

describe("תווית שורה ביומן הגרסאות", () => {
  it("היצירה הראשונה היא המקור", () => {
    expect(versionEntryLabel(entry(""), 0)).toBe(d.versionOriginal);
  });

  it("בקשת שינוי מוצגת כפי שנוסחה", () => {
    expect(versionEntryLabel(entry("לדלל את החיתוכים בקצה"), 1)).toBe("לדלל את החיתוכים בקצה");
  });

  it("בחירת הצעה אינה 'העיצוב המקורי' — הרגרסיה שנסגרה", () => {
    // כל בחירת הצעה נשמרת בלי טקסט, ולכן נפלה קודם ל-versionOriginal:
    // שלוש בחירות נתנו שלוש שורות שכולן טענו שהן המקור.
    for (const i of [1, 2, 3]) {
      expect(versionEntryLabel(entry(""), i)).toBe(d.versionPicked);
      expect(versionEntryLabel(entry(""), i)).not.toBe(d.versionOriginal);
    }
  });

  it("רק שורה אחת ביומן יכולה לטעון שהיא המקור", () => {
    const log = [entry(""), entry(""), entry("שינוי"), entry("")];
    const originals = log
      .map((e, i) => versionEntryLabel(e, i))
      .filter((label) => label === d.versionOriginal);
    expect(originals).toHaveLength(1);
  });
});
