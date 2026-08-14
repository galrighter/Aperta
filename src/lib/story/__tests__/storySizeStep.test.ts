import { describe, expect, it } from "vitest";
import {
  INITIAL, RAIL, STORY_RAIL, circumferenceMm, railFor, railIndex, sizeReallyChanged,
  stripLengthMm, type CreateState,
} from "@/components/create/model";
import { storyFrameDims } from "../mode";
import { FAB } from "@/lib/fabrication.config";
import type { DesignDims } from "@/lib/geometry/validate";

/**
 * story mode — המידה זזה לשלב ההזמנה.
 *
 * הטענה: במסלול הפשוט הלקוחה מספרת, מקבלת תרגומים ובוחרת — ורק אז נמדדת.
 * שלושה דברים חייבים להיות נכונים כדי שזה יעבוד, וכאן נבדק כל אחד מהם:
 *
 *  1. **סדר השלבים** — הסרגל מכיר את הסדר החדש (מידות אחרי תוצאה), ואינו
 *     מציע שלב שאין לו מסך במסלול הזה.
 *  2. **יש מה להריץ בלי מידה** — עד שהיא נבחרת המסע עובד עם ברירת המחדל של
 *     המערכת, ולא עם אפס.
 *  3. **המידה שנבחרה אחר כך היא קנה מידה אחיד** על אותה צורה — ולא מתיחה
 *     בציר אחד ולא יצירה מחדש.
 */

const storyState = (patch: Partial<CreateState> = {}): CreateState => ({
  ...INITIAL,
  story: true,
  product: "bracelet",
  brief: "הקיץ שהיינו נוסעים לים.",
  ...patch,
});

describe("סדר השלבים", () => {
  it("במסלול הפשוט המידות באות אחרי התוצאה", () => {
    expect(STORY_RAIL.map((r) => r.key)).toEqual([
      "brief", "result", "sizes", "summary", "checkout",
    ]);
    expect(railIndex(true, "result")).toBeLessThan(railIndex(true, "sizes"));
    expect(railIndex(true, "sizes")).toBeLessThan(railIndex(true, "summary"));
  });

  it("במסלול הרגיל שום דבר לא זז", () => {
    expect(railFor(false)).toBe(RAIL);
    expect(RAIL.map((r) => r.key)).toEqual([
      "product", "sizes", "brief", "result", "summary", "checkout",
    ]);
    expect(railIndex(false, "sizes")).toBeLessThan(railIndex(false, "brief"));
    expect(railIndex(false, "done")).toBe(5);
  });

  it("אין במסלול הפשוט שלב מוצר — אין לו מסך שם", () => {
    expect(STORY_RAIL.some((r) => r.screens.includes("product"))).toBe(false);
    expect(railIndex(true, "product")).toBe(-1);
  });

  it("כל מסך שהמסלול הפשוט מציג יושב על שלב בסרגל שלו", () => {
    for (const screen of ["brief", "processing", "result", "sizes", "summary", "checkout", "done"] as const) {
      expect(railIndex(true, screen)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("יצירה לפני שיש מידה", () => {
  it("בלי מידה שהוזנה המסע רץ על הפריסט הבינוני, לא על אפס", () => {
    const s = storyState();
    expect(s.circ).toBe("");
    expect(circumferenceMm(s)).toBeGreaterThan(100);
    expect(stripLengthMm(s)).toBeGreaterThan(100);
  });

  it("אותו דבר בטבעת", () => {
    const s = storyState({ product: "ring" });
    expect(s.ringSize).toBe("");
    expect(circumferenceMm(s)).toBeGreaterThan(30);
    expect(stripLengthMm(s)).toBeGreaterThan(30);
  });

  it("המידה שנבחרת אחר כך אכן מזיזה את האורך", () => {
    const before = stripLengthMm(storyState());
    const after = stripLengthMm(storyState({ circ: "200" }));
    expect(after).toBeGreaterThan(before);
  });
});

describe("המידה שנבחרה בשלב ההזמנה", () => {
  /** cutouts SVG במסגרת נתונה — מספיק כדי שיהיה מה למדוד. */
  const svgOf = (lengthMm: number, widthMm: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lengthMm} ${widthMm}">` +
    `<g id="cutouts"><path d="M1 1 L2 1 L2 2 L1 2 Z" fill="black"/></g></svg>`;

  it("מסגור מחדש לאורך החדש הוא קנה מידה אחיד — הצורה אינה נמתחת", () => {
    // העיצוב נוצר על ברירת המחדל ויצא 150×24; הלקוחה בחרה יד גדולה יותר.
    const drawn = svgOf(150, 24);
    const ordered: DesignDims = {
      productType: "bracelet",
      lengthMm: 180,
      // הרוחב שברשומה אינו רלוונטי — הוא נגזר מחדש מהיחס שצויר.
      widthMm: 18,
      thicknessMm: FAB.defaultThicknessMm,
    };
    const dims = storyFrameDims(ordered, drawn);
    expect(dims.lengthMm).toBe(180);
    expect(dims.widthMm).toBeCloseTo(28.8, 5); // 24 × (180/150)
    // וזו ההגדרה של "אחיד": אותו יחס בדיוק, לפני ואחרי.
    expect(dims.lengthMm / dims.widthMm).toBeCloseTo(150 / 24, 5);
  });

  it("גם בהקטנה", () => {
    const dims = storyFrameDims(
      { productType: "bracelet", lengthMm: 120, widthMm: 18, thicknessMm: FAB.defaultThicknessMm },
      svgOf(150, 24),
    );
    expect(dims.lengthMm).toBe(120);
    expect(dims.widthMm).toBeCloseTo(19.2, 5);
    expect(dims.lengthMm / dims.widthMm).toBeCloseTo(150 / 24, 5);
  });
});

describe("שינוי מידה על עיצוב קיים", () => {
  /** אותה הכרעה שנעשית ב-`setSizes`: האם השינוי מבטל את מה שכבר נוצר. */
  const invalidates = (s: CreateState, patch: Partial<CreateState>): boolean =>
    !s.story && s.designId !== null && sizeReallyChanged(s, patch);

  it("במסלול הפשוט המידה אינה מוחקת את התרגום שנבחר", () => {
    const s = storyState({ designId: "d1" });
    expect(sizeReallyChanged(s, { circ: "180" })).toBe(true); // השינוי אמיתי
    expect(invalidates(s, { circ: "180" })).toBe(false); // ובכל זאת לא מבטל
  });

  it("במסלול הרגיל היא ממשיכה לבטל, כמו תמיד", () => {
    const s: CreateState = { ...INITIAL, product: "bracelet", designId: "d1" };
    expect(invalidates(s, { circ: "180" })).toBe(true);
    expect(invalidates(s, { circ: "" })).toBe(false); // אותו ערך — אין שינוי
  });
});
