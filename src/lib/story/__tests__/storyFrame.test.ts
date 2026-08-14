import { describe, expect, it } from "vitest";
import { frameCutoutsDims } from "@/lib/geometry/frameCutouts";
import { FAB } from "@/lib/fabrication.config";
import { priceFor } from "@/lib/pricing";
import {
  INITIAL, frameWidthMm, priceOf, type CreateState, type EditEntry,
} from "@/components/create/model";
import type { DesignDims } from "@/lib/geometry/validate";
import { isStory, orderByVariety, storyFrameDims, widthRangeOf } from "../mode";

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
    expect(framed.lengthMm / 200).toBeCloseTo(framed.widthMm / 40, 6);
    // וזה גם מה ש-`stretch` מדווח. עד 15.8 הוא נמדד מול הרוחב ש**הוזמן**
    // ולכן החזיר כאן את מקדם ההגדלה עצמו (×0.8 / ×1.57 ב-AP-0170) על מסגור
    // אחיד לגמרי — שדה יומן שקרי, ומפתח דירוג (`|stretch − 1|`) שדירג לפי
    // כמה קצר המודל צייר במקום לפי כמה הוא מתעוות.
    expect(framed.stretch).toBeCloseTo(1, 6);
  });

  /* **הצביטה לטווח הייצור הוסרה** (החלטת גל): קנה המידה הוא של המודל, ואנחנו
     רק מותחים או מכווצים לאורך הנכון. הצביטה הייתה הדבר היחיד שהחזיר מתיחה
     אופקית למסלול שכל קיומו הוא למנוע אותה — ובטבעת היא נגעה בכל יחס מתחת
     ל-3.3, כלומר בתחום שהמודל באמת מצייר. מה ששומר על הייצור הוא הוולידציה,
     שרצה על הגאומטריה שאחרי המסגור. */
  it("רוחב שנגזר מעל טווח הייצור נשאר מה שנגזר — אין צביטה", () => {
    // ציור כמעט ריבועי: הרוחב האחיד הוא 128 מ"מ, הרבה מעל המקסימום (80).
    const dims = storyFrameDims(ORDERED, svgOf(100, 80));
    expect(dims.widthMm).toBeCloseTo(128, 5);
    expect(dims.widthMm).toBeGreaterThan(FAB.products.bracelet.widthRangeMm[1]);
  });

  it("גם בטבעת, ובשני הכיוונים", () => {
    const ringOrdered: DesignDims = { ...ORDERED, productType: "ring", lengthMm: 55, widthMm: 6 };
    // מעל המקסימום (18)
    expect(storyFrameDims(ringOrdered, svgOf(100, 80)).widthMm).toBeCloseTo(44, 5);
    // ומתחת למינימום (4)
    expect(storyFrameDims(ringOrdered, svgOf(1000, 20)).widthMm).toBeCloseTo(1.1, 5);
  });

  it("ומה שיוצא מהטווח ממשיך להתמסגר בלי מתיחה", () => {
    const drawn = svgOf(100, 80);
    const framed = frameCutoutsDims(storyFrameDims(ORDERED, drawn), drawn);
    // אותו קנה מידה בשני הצירים, גם ברוחב שאין לו מקום בטווח הייצור.
    expect(framed.lengthMm / 100).toBeCloseTo(framed.widthMm / 80, 6);
  });

  it("SVG בלי viewBox תקין מחזיר את המידות שהוזמנו כמות שהן", () => {
    expect(storyFrameDims(ORDERED, "<svg></svg>")).toEqual(ORDERED);
  });
});

/* טווח הרוחב נמסר למודל **בעריכה ובכיתוב בלבד** — ביצירה מאפס הפרומפט של
   המסלול אינו מוסר מידות. מאז שהצביטה הוסרה הרוחב של הפריט שנערך יכול לשבת
   מחוץ לטווח הייצור, והמשפט היה סותר את עצמו: "ברוחב 4 עד 18, כשבערך 44
   הוא הרגיל". */
describe("widthRangeOf", () => {
  it("בלי רוחב בפועל — טווח הייצור, כמו קודם", () => {
    expect(widthRangeOf("ring")).toEqual(FAB.products.ring.widthRangeMm);
    expect(widthRangeOf("bracelet")).toEqual(FAB.products.bracelet.widthRangeMm);
  });

  it("רוחב שבתוך הטווח אינו מזיז אותו", () => {
    expect(widthRangeOf("ring", 9)).toEqual(FAB.products.ring.widthRangeMm);
  });

  it("רוחב שמעל הטווח פותח את הגבול העליון", () => {
    expect(widthRangeOf("ring", 44)).toEqual([FAB.products.ring.widthRangeMm[0], 44]);
  });

  it("ורוחב שמתחתיו פותח את התחתון", () => {
    expect(widthRangeOf("ring", 1.1)).toEqual([1.1, FAB.products.ring.widthRangeMm[1]]);
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

  it("הרוחב שנגזר אינו נוגע במחיר — לא על המסך ולא בשרת", () => {
    // במסלול Story הרוחב אינו נבחר אלא נגזר מהעיצוב שחזר, ולכן הוא **חייב**
    // להיות חסר משמעות לתמחור: אי אפשר להבטיח מחיר לפני היצירה ואז לגבות לפי
    // מה שהמודל צייר. מאז המחיר הקבוע (lib/pricing.ts) זה נכון במבנה עצמו —
    // והטסט הזה נועל את זה מהצד של Story, שבו זה קריטי.
    //
    // בפועל זה גם מה שמונע דחיית הזמנה: ההזמנה שולחת `widthMm` מה-viewBox
    // ו-`displayedTotal` מ-`priceOf`, והשרת פוסל ב-409 (`price_changed`)
    // כששני המספרים אינם מסכימים. כשהרוחב אינו קלט לתמחור, אין על מה לא להסכים.
    const entry = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32"></svg>',
    } as EditEntry;
    const s: CreateState = {
      ...INITIAL, story: true, product: "bracelet", braceletWidth: 18,
      edits: [entry], activeEdit: 0,
    };
    const derived = Math.round(frameWidthMm(s, entry) * 10) / 10;
    expect(derived).toBe(32); // הרוחב באמת נגזר, ואינו 18

    const shown = priceOf(s);
    // מה שהשרת יחשב על אותה הזמנה, ומה שהמסך היה מציג אחרי סנכרון הרוחב.
    expect(priceFor({ productType: "bracelet" }).total).toBe(shown.total);
    expect(priceOf({ ...s, braceletWidth: derived }).total).toBe(shown.total);
  });

  it("`isStory` דולק רק על המחרוזת המפורשת", () => {
    expect(isStory("story")).toBe(true);
    expect(isStory(undefined)).toBe(false);
    expect(isStory(null)).toBe(false);
    expect(isStory("Story")).toBe(false);
  });
});
