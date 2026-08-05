import { describe, expect, it } from "vitest";
import { designCode, designSampleCode, designSampleDigits } from "../designCode";

describe("designCode", () => {
  it("pads to four digits", () => {
    expect(designCode(1)).toBe("AP-0001");
    expect(designCode(42)).toBe("AP-0042");
  });

  it("does not truncate past four digits", () => {
    expect(designCode(12345)).toBe("AP-12345");
  });

  it("returns null when there is no serial", () => {
    // עיצוב שנוצר לפני המיגרציה, או שהתשובה מהשרת לא כללה את השדה. הקוראים
    // מסתמכים על null כדי להסתיר את השורה במקום להציג "AP-null".
    expect(designCode(null)).toBeNull();
    expect(designCode(undefined)).toBeNull();
    expect(designCode(0)).toBeNull();
    expect(designCode(Number.NaN)).toBeNull();
  });
});

describe("designSampleCode", () => {
  it("is the plain design code for a design that isn't a sample of anything", () => {
    expect(designSampleCode({ serial: 85 })).toBe("AP-0085");
    expect(designSampleCode({ serial: 85, root_serial: null, sample_no: null })).toBe("AP-0085");
  });

  it("is the root's serial with the sample number, not the sample's own serial (0018)", () => {
    // הדוגמה השנייה משכפול של AP-0085 — גם אם השורה עצמה קיבלה serial=86.
    expect(designSampleCode({ serial: 86, root_serial: 85, sample_no: 2 })).toBe("AP-0085.2");
  });

  it("falls back to the design's own serial when the sample fields are incomplete", () => {
    // מצב שלא אמור לקרות (האילוץ במיגרציה 0018 אוכף שניהם-או-כלום), אבל
    // נפילה בטוחה חשובה יותר מלהניח שהיא לא תקרה.
    expect(designSampleCode({ serial: 86, root_serial: null, sample_no: 2 })).toBe("AP-0086");
  });
});

describe("designSampleDigits", () => {
  it("has no AP- prefix, for use in file names", () => {
    expect(designSampleDigits({ serial: 85 })).toBe("0085");
    expect(designSampleDigits({ serial: 86, root_serial: 85, sample_no: 2 })).toBe("0085.2");
  });
});
