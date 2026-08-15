import { describe, it, expect } from "vitest";
import {
  INITIAL, circMmOfDesign, circumferenceMm, gapOf, sizeFieldsOfDesign, sizeOfDesign,
  stripLengthMm, type CreateState, type Fit,
} from "../model";
import { FAB } from "@/lib/fabrication.config";

// שחזור עיצוב שמור. עד לתיקון הזה המסך הפך את אורך הפריסה חזרה למידה בסכום
// `length_mm + gap_mm` — כאילו הפריסה היא "היקף − פתח". היא לא: היא נמדדת על
// הציר הניטרלי, הפתח הוא מיתר, ובאורך כבר יושבות תוספת ה-Fit ותוספת הרוחב.
// התוצאה הייתה ניפוח שקט של ~2 ס"מ בצמיד ו-~1.5 מידות בטבעת, ויצירה חוזרת
// שכתבה את המספר המנופח לעיצוב — בדיוק המנגנון ש-AP-0065 אוסר.
//
// המבחן כאן הוא סיבוב שלם: מידה → פריסה (מה שנשמר) → מידה (מה שהשחזור מציג).

const stateOf = (patch: Partial<CreateState>): CreateState => ({ ...INITIAL, ...patch });

/** השורה שהעיצוב נשמר בה, מתוך מצב המסך שיצר אותו. */
const rowOf = (s: CreateState) => ({
  product_type: s.product ?? "bracelet",
  length_mm: stripLengthMm(s),
  width_mm: s.product === "ring" ? s.ringWidth : s.braceletWidth,
  gap_mm: gapOf(s),
  thickness_mm: FAB.defaultThicknessMm,
});

describe("שחזור עיצוב שמור מחזיר את המידה שהוזמנה", () => {
  it.each(["140", "165", "180", "210"])("צמיד לפרק %s מ\"מ חוזר כמות שהוא", (wrist) => {
    const s = stateOf({ product: "bracelet", circ: wrist, braceletWidth: 18 });
    const back = sizeFieldsOfDesign(rowOf(s)) as { circ: string };
    expect(Number(back.circ)).toBeCloseTo(Number(wrist), 0);
  });

  it.each(["4", "6.5", "7", "10", "13"])("טבעת במידה %s חוזרת כמות שהיא", (size) => {
    const s = stateOf({ product: "ring", ringSize: size, ringWidth: 6 });
    const back = sizeFieldsOfDesign(rowOf(s)) as { ringSize: string };
    expect(Number(back.ringSize)).toBe(Number(size));
  });

  it("כל רמת ישיבה חוזרת לעצמה — ה-Fit נכנס לחישוב ההפוך", () => {
    for (const fit of ["tight", "regular", "loose"] as Fit[]) {
      const s = stateOf({ product: "bracelet", circ: "165", braceletWidth: 18, fit });
      const back = sizeFieldsOfDesign(rowOf(s), fit) as { circ: string };
      expect(Number(back.circ)).toBeCloseTo(165, 0);
    }
  });

  it("הרוחב חוזר מהשורה ולא מברירת המחדל", () => {
    const s = stateOf({ product: "bracelet", circ: "165", braceletWidth: 40 });
    expect(sizeFieldsOfDesign(rowOf(s))).toMatchObject({ braceletWidth: 40 });
    const r = stateOf({ product: "ring", ringSize: "7", ringWidth: 12 });
    expect(sizeFieldsOfDesign(rowOf(r))).toMatchObject({ ringWidth: 12 });
  });

  it("שחזור ויצירה חוזרת אינם מנפחים את הפריסה", () => {
    // התרחיש המלא: לקוחה מקבלת מייל comeback, נוחתת על הטופס המשוחזר,
    // ולוחצת "נסו שוב" — היצירה החוזרת כותבת את האורך מחדש.
    for (const s of [
      stateOf({ product: "bracelet", circ: "165", braceletWidth: 18 }),
      stateOf({ product: "ring", ringSize: "7", ringWidth: 6 }),
    ]) {
      const saved = stripLengthMm(s);
      const resumed = stateOf({ ...s, ...sizeFieldsOfDesign(rowOf(s)) });
      expect(stripLengthMm(resumed)).toBeCloseTo(saved, 0);
    }
  });

  it("הסכום הישן היה מנפח — הרגרסיה עצמה", () => {
    const s = stateOf({ product: "bracelet", circ: "165", braceletWidth: 18 });
    const row = rowOf(s);
    const old = Number(row.length_mm) + Number(row.gap_mm);
    expect(old - 165).toBeGreaterThan(15);
    expect(Math.abs(circMmOfDesign(row) - 165)).toBeLessThan(1);
  });
});

describe("ההיקף ברשימת העיצובים הוא אותה יחידה שהמסך מציג", () => {
  it("צמיד — פרק היד; טבעת — היקף האצבע", () => {
    for (const s of [
      stateOf({ product: "bracelet", circ: "165", braceletWidth: 18 }),
      stateOf({ product: "ring", ringSize: "7", ringWidth: 6 }),
    ]) {
      expect(circMmOfDesign(rowOf(s))).toBeCloseTo(circumferenceMm(s), 0);
    }
  });

  it("עובי חסר בשורה נופל לברירת המחדל ולא ל-NaN", () => {
    const s = stateOf({ product: "bracelet", circ: "165", braceletWidth: 18 });
    const { thickness_mm: _drop, ...noThickness } = rowOf(s);
    expect(circMmOfDesign(noThickness)).toBeCloseTo(165, 0);
    expect(sizeOfDesign(noThickness).nominalIdMm).toBeGreaterThan(0);
  });
});
