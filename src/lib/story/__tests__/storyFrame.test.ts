import { describe, expect, it } from "vitest";
import { frameCutoutsDims } from "@/lib/geometry/frameCutouts";
import { FAB } from "@/lib/fabrication.config";
import { priceFor } from "@/lib/pricing";
import {
  INITIAL, frameWidthMm, priceOf, type CreateState, type EditEntry,
} from "@/components/create/model";
import type { DesignDims } from "@/lib/geometry/validate";
import { clampWidth, isStory, orderByVariety, storyFrameDims } from "../mode";

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

describe("orderByVariety", () => {
  /** מועמד לצורך הסדר בלבד: כמה פתוח, ובאיזו פרופורציה. */
  const cand = (openAreaPct: number, drawnRatio: number, id: string) => ({
    report: { metrics: { openAreaPct } }, drawnRatio, id,
  });

  it("ההצעה הראשונה נשארת מי שהייתה — היא זו שנשמרת כגרסה", () => {
    const out = orderByVariety([
      cand(30, 9, "winner"), cand(31, 9.1, "twin"), cand(70, 4, "other"), cand(50, 6, "mid"),
    ]);
    expect(out[0].id).toBe("winner");
  });

  it("השנייה בתור היא הרחוקה מהראשונה, לא הדומה לה", () => {
    // שלוש הצעות כמעט זהות ואחת שונה לגמרי: בלי הסידור, מי שגוללת רואה
    // קודם את התאומה ורק בסוף את מה שבאמת אחר.
    const out = orderByVariety([
      cand(30, 9, "winner"), cand(31, 9.1, "twin"), cand(30.5, 8.9, "twin2"), cand(72, 3.5, "far"),
    ]);
    expect(out.map((c) => c.id)).toEqual(["winner", "far", "twin", "twin2"]);
  });

  it("שומר על כל ההצעות, ולא נוגע ברשימה קצרה", () => {
    const two = [cand(30, 9, "a"), cand(70, 4, "b")];
    expect(orderByVariety(two).map((c) => c.id)).toEqual(["a", "b"]);
    const four = [cand(30, 9, "a"), cand(31, 9, "b"), cand(70, 4, "c"), cand(50, 6, "d")];
    expect(orderByVariety(four).map((c) => c.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("מועמדים זהים לחלוטין אינם מפילים את החישוב (טווח אפס)", () => {
    const same = [cand(40, 7, "a"), cand(40, 7, "b"), cand(40, 7, "c")];
    expect(orderByVariety(same).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("דוח חסר נספר כאפס ולא זורק", () => {
    const items = [
      { report: null, drawnRatio: 9, id: "a" },
      { report: { metrics: null }, drawnRatio: 4, id: "b" },
      cand(60, 6, "c"),
    ];
    expect(orderByVariety(items).map((c) => c.id)).toHaveLength(3);
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

  it("המחיר שעל המסך והמחיר שהשרת מחשב נגזרים מאותו רוחב", () => {
    // **למה זה טסט של Story דווקא.** ההזמנה שולחת `widthMm` מה-viewBox של
    // הגרסה ו-`displayedTotal` מ-`priceOf`, שקורא את המצב. השרת מתמחר מ-
    // `widthMm` ופוסל ב-409 (`price_changed`) כששני המספרים אינם מסכימים.
    // במסלול הרגיל הרוחב הוא בחירה והשניים מתלכדים; במסלול Story הוא נגזר,
    // ולכן המצב **חייב** להתעדכן ממנו — וזה מה שהאפקט ב-design/page.tsx עושה.
    const entry = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32"></svg>',
    } as EditEntry;
    const nominal: CreateState = {
      ...INITIAL, story: true, product: "bracelet", braceletWidth: 18,
      edits: [entry], activeEdit: 0,
    };
    const ordered = Math.round(frameWidthMm(nominal, entry) * 10) / 10;
    const server = priceFor({ productType: "bracelet", widthMm: ordered, density: "medium" });

    // בלי הסנכרון: המסך מתמחר 18 מ"מ, ההזמנה שולחת 32 — והקופה נועלת.
    expect(priceOf(nominal).total).not.toBe(server.total);
    // עם הסנכרון: אותו קלט בדיוק בשני הצדדים.
    expect(priceOf({ ...nominal, braceletWidth: ordered }).total).toBe(server.total);
  });

  it("`isStory` דולק רק על המחרוזת המפורשת", () => {
    expect(isStory("story")).toBe(true);
    expect(isStory(undefined)).toBe(false);
    expect(isStory(null)).toBe(false);
    expect(isStory("Story")).toBe(false);
  });
});
