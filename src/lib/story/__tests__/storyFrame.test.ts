import { describe, expect, it } from "vitest";
import { frameCutoutsDims } from "@/lib/geometry/frameCutouts";
import { FAB } from "@/lib/fabrication.config";
import type { DesignDims } from "@/lib/geometry/validate";
import { clampWidth, isStory, storyFrameDims } from "../mode";

/**
 * story mode — הטענה שכל המסלול נשען עליה: **האורך נקבע לפי המידה של האדם,
 * הרוחב נובע מהעיצוב, ואין מתיחה נפרדת בציר אחד.**
 *
 * הטסטים כאן בודקים את שני הצדדים שלה: שהחישוב מייצר קנה מידה אחיד, ושהמסלול
 * הקיים — אותה פונקציית מסגור בדיוק, בלי `storyFrameDims` — ממשיך להתנהג כפי
 * שהתנהג. השני חשוב לא פחות: כל השינוי במסלול Story נעשה **מחוץ** לקוד
 * הגיאומטרי, וטסט שנופל כאן פירושו שמשהו דלף פנימה.
 */

const ORDERED: DesignDims = {
  productType: "bracelet",
  lengthMm: 160,
  widthMm: 18,
  thicknessMm: FAB.defaultThicknessMm,
};

/** cutouts SVG במסגרת נתונה — חיתוך אחד קטן במרכז, מספיק כדי שיהיה מה למסגר. */
const svgOf = (lengthMm: number, widthMm: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lengthMm} ${widthMm}">` +
  `<g id="cutouts"><path d="M${lengthMm / 2 - 3} ${widthMm / 2 - 1} L${lengthMm / 2 + 3} ${widthMm / 2 - 1} ` +
  `L${lengthMm / 2 + 3} ${widthMm / 2 + 1} L${lengthMm / 2 - 3} ${widthMm / 2 + 1} Z" fill="black"/></g></svg>`;

describe("storyFrameDims", () => {
  it("שומר על יחס הצדדים: הרוחב נגזר מהיחס שצויר, לא מהמוזמן", () => {
    // המודל צייר 200×40 (יחס 5) כשהוזמן 160×18 (יחס 8.9).
    const dims = storyFrameDims(ORDERED, svgOf(200, 40));
    expect(dims.lengthMm).toBe(160); // האורך הוא המדידה ואינו זז
    expect(dims.widthMm).toBeCloseTo(32, 5); // 40 × (160/200)
  });

  it("המסגור מקבל את המידות האלה ולא מותח כלום", () => {
    const drawn = svgOf(200, 40);
    const framed = frameCutoutsDims(storyFrameDims(ORDERED, drawn), drawn);
    expect(framed.lengthMm).toBe(160);
    expect(framed.widthMm).toBeCloseTo(32, 2);
    // **זו כל ההבטחה של המסלול**: אותו קנה מידה בשני הצירים.
    //
    // נמדד על המקדמים עצמם ולא על `stretch` שהמסגור מדווח. `stretch` שם הוא
    // `correction / (widthMm / orderedWidth)` — כלומר מדד שנמדד מול הרוחב
    // ש**הוזמן**, והוא מכשיר דירוג בין מועמדים (`|stretch − 1|`) ולא מדידה של
    // עיוות. כאן שואלים את השאלה הישירה: פי כמה גדל כל ציר.
    expect(framed.lengthMm / 200).toBeCloseTo(framed.widthMm / 40, 6);
  });

  it("רוחב שנגזר מחוץ לטווח הייצור נצבט אליו ולא מעבר", () => {
    // ציור כמעט ריבועי: הרוחב האחיד היה 128 מ"מ, מעל המקסימום (80).
    const dims = storyFrameDims(ORDERED, svgOf(100, 80));
    expect(dims.widthMm).toBe(FAB.products.bracelet.widthRangeMm[1]);
  });

  it("טבעת נצבטת לטווח שלה ולא לזה של הצמיד", () => {
    const ringOrdered: DesignDims = { ...ORDERED, productType: "ring", lengthMm: 55, widthMm: 6 };
    expect(storyFrameDims(ringOrdered, svgOf(100, 80)).widthMm).toBe(
      FAB.products.ring.widthRangeMm[1],
    );
    expect(clampWidth(0.2, "ring")).toBe(FAB.products.ring.widthRangeMm[0]);
  });

  it("SVG בלי viewBox תקין מחזיר את המידות שהוזמנו כמות שהן", () => {
    expect(storyFrameDims(ORDERED, "<svg></svg>")).toEqual(ORDERED);
  });
});

describe("המסלול הקיים", () => {
  it("ממשיך להיצמד לרוחב שהוזמן ולדווח על המתיחה — בלי story", () => {
    // אותו ציור בדיוק, בלי storyFrameDims: זו ההתנהגות שהעורך נשען עליה —
    // הרוחב הוא מה שהלקוחה בחרה, וכל הפער נכנס למתיחה האופקית.
    const framed = frameCutoutsDims(ORDERED, svgOf(200, 40));
    expect(framed.widthMm).toBe(18);
    // הצירים **אינם** באותו קנה מידה, וזה מכוון כאן: 0.8 מול 0.45.
    expect(framed.lengthMm / 200).not.toBeCloseTo(framed.widthMm / 40, 2);
  });

  it("`isStory` דולק רק על המחרוזת המפורשת", () => {
    expect(isStory("story")).toBe(true);
    expect(isStory(undefined)).toBe(false);
    expect(isStory(null)).toBe(false);
    expect(isStory("Story")).toBe(false);
  });
});
