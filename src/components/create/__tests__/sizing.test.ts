import { describe, it, expect } from "vitest";
import { INITIAL, circumferenceMm, gapOf, stripLengthMm, type CreateState } from "../model";
import { sizeFromBlank, US_RING_ID_MM, idMmFromUsSize, nearestUsRingSize } from "@/lib/sizing";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";

// מסע היצירה הוא מסלול ההזמנות בפועל. עד לתיקון הזה הוא חישב
// `אורך = היקף − פתח`, שמשמיט את איבר הציר הניטרלי (2πKt) ומחסיר את הפער
// כאילו היה קו ישר ולא קשת. הבדיקות כאן נועלות את התוצאה: מה שהלקוחה מבקשת
// הוא מה שהיא מקבלת. רקע: docs/sizing-fit-review.md §2.

const ring = (patch: Partial<CreateState> = {}): CreateState => ({
  ...INITIAL, product: "ring", ringWidth: 4, ...patch,
});
const cuff = (patch: Partial<CreateState> = {}): CreateState => ({
  ...INITIAL, product: "bracelet", braceletWidth: 4, ...patch,
});

/** מה יוצא בפועל מהפריסה שהמסע מזמין. */
const actualRingSize = (s: CreateState) =>
  sizeFromBlank(stripLengthMm(s), {
    product: "ring",
    thicknessMm: FAB.defaultThicknessMm,
    widthMm: s.ringWidth,
    gapChordMm: gapOf(s),
  }).usRingSize!;

const actualWristMm = (s: CreateState) =>
  sizeFromBlank(stripLengthMm(s), {
    product: "bracelet",
    thicknessMm: FAB.defaultThicknessMm,
    widthMm: s.braceletWidth,
    gapChordMm: gapOf(s),
    fit: s.fit === "tight" ? "snug" : s.fit === "loose" ? "loose" : "comfort",
  }).wristMm!;

describe("טבעת — המידה שמוזמנת היא המידה שמתקבלת", () => {
  // הרגרסיה: 7→6.1, 10→7.9, 13→9.8. השגיאה גדלה עם המידה.
  it.each([4, 5, 6, 7, 8, 9, 10, 11, 12, 13])("מידה %i יוצאת מידה %i", (size) => {
    expect(actualRingSize(ring({ ringSize: String(size) }))).toBe(size);
  });

  it("גם חצאי מידות", () => {
    for (const size of [5.5, 6.5, 7.5, 10.5]) {
      expect(actualRingSize(ring({ ringSize: String(size) }))).toBe(size);
    }
  });

  it("היקף האצבע נגזר מטבלת ה-ID התקנית ולא מקירוב ליניארי", () => {
    // הקירוב הישן: 44.8 + מידה × 1.6
    for (const size of [4, 7, 10, 13]) {
      const expected = Math.PI * US_RING_ID_MM[String(size)];
      expect(circumferenceMm(ring({ ringSize: String(size) }))).toBeCloseTo(expected, 6);
    }
    // ובמידה 13 הקירוב הישן חרג ביותר מ-2 מ"מ
    expect(Math.abs(44.8 + 13 * 1.6 - Math.PI * US_RING_ID_MM["13"])).toBeGreaterThan(2);
  });

  it("קלט מעל 30 נחשב היקף במ\"מ ישירות, לא מידה", () => {
    expect(circumferenceMm(ring({ ringSize: "60" }))).toBe(60);
  });

  it("אינטרפולציה בין מידות שאינן בטבלה נשארת מונוטונית", () => {
    let prev = 0;
    for (let x = 4; x <= 13; x += 0.1) {
      const id = idMmFromUsSize(x);
      expect(id).toBeGreaterThan(prev);
      prev = id;
    }
  });
});

describe("צמיד — הישיבה באמת משנה את הישיבה", () => {
  it("היקף פרק היד חוזר במדויק בכל רמת ישיבה", () => {
    for (const fit of ["tight", "regular", "loose"] as const) {
      for (const wrist of ["150", "165", "180"]) {
        expect(actualWristMm(cuff({ circ: wrist, fit }))).toBeCloseTo(Number(wrist), 1);
      }
    }
  });

  it("המרווח גדל מונוטונית בין הרמות — קודם הוא כמעט לא זז והיה שלילי", () => {
    const innerCirc = (fit: CreateState["fit"]) => {
      const s = cuff({ circ: "165", fit });
      return sizeFromBlank(stripLengthMm(s), {
        product: "bracelet", thicknessMm: FAB.defaultThicknessMm,
        widthMm: 4, gapChordMm: gapOf(s), fit: "comfort",
      }).innerCircumferenceMm;
    };
    const tight = innerCirc("tight"), regular = innerCirc("regular"), loose = innerCirc("loose");
    expect(tight).toBeLessThan(regular);
    expect(regular).toBeLessThan(loose);
    // כל שלוש הרמות רחבות מהיד הנמדדת, לא הדוקות ממנה
    expect(tight).toBeGreaterThan(165);
    // וההפרש בין הקצוות הוא סדר גודל אמיתי, לא 2.2 מ"מ
    expect(loose - tight).toBeGreaterThan(10);
  });
});

describe("הפער הוא קבוע אנטומי ולא פונקציה של הישיבה", () => {
  it("זהה בכל רמות הישיבה", () => {
    const gaps = (["tight", "regular", "loose"] as const).map((fit) => gapOf(cuff({ fit })));
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBe(FAB.products.bracelet.defaultGapMm);
  });

  it("טבעת מקבלת את פער הטבעת", () => {
    expect(gapOf(ring())).toBe(FAB.products.ring.defaultGapMm);
  });
});

describe("מדריך המדידה מסכים עם המנוע", () => {
  // המדריך נוקב במספרים מפורשים ("היקף 52 מ״מ ≈ מידה 6"). הם היו שגויים
  // בכ-0.8 מידה, ואין דרך לתפוס את זה חוץ מלבדוק את הטקסט מול המודל.
  it("העוגנים בטקסט נותנים את המידות שהם מבטיחים", () => {
    const anchors: Array<[number, number]> = [[52, 6], [54.5, 7], [57, 8]];
    const text = he.design.guideStepsRing.join(" ");
    for (const [circ, size] of anchors) {
      expect(text).toContain(`${circ} מ״מ ≈ מידה ${size}`);
      expect(nearestUsRingSize(circ / Math.PI)).toBe(size);
    }
  });

  it("המדריך לא מבטיח שהטבעת מתכווננת ביד", () => {
    const text = he.design.guideNoteRing + he.design.guideStepsRing.join(" ");
    expect(text).not.toMatch(/לכוונן אותה|ניתן לכוונן אותה/);
  });

  it("המדריך לצמיד לא טוען שהפתח נגזר מסוג הישיבה", () => {
    // התיישן כשהפתח הפך לקבוע אנטומי והישיבה לתוספת להיקף
    expect(he.design.guideStepsBracelet.join(" ")).not.toMatch(/הפתח לפי סוג הישיבה/);
  });
});

describe("אורך הפריסה נגזר מהמידה ואינו נחתך", () => {
  it("מידות מבוגר נופלות בתוך הרמז המוצג", () => {
    const [blo, bhi] = FAB.products.bracelet.lengthHintMm;
    // 140 ולא 130: הרמז 125 מתאר פרק יד 14 ס"מ ב-snug, ו-13 ס"מ נמצא מתחתיו.
    // הבדיקה הקודמת עברה על 130 רק בזכות החיתוך שהיא הייתה אמורה לבדוק.
    for (const wrist of ["140", "165", "210"]) {
      for (const fit of ["tight", "regular", "loose"] as const) {
        const L = stripLengthMm(cuff({ circ: wrist, fit }));
        expect(L).toBeGreaterThanOrEqual(blo);
        expect(L).toBeLessThanOrEqual(bhi);
      }
    }
    const [rlo, rhi] = FAB.products.ring.lengthHintMm;
    for (const size of ["4", "7", "13"]) {
      const L = stripLengthMm(ring({ ringSize: size }));
      expect(L).toBeGreaterThanOrEqual(rlo);
      expect(L).toBeLessThanOrEqual(rhi);
    }
  });

  it("היקף קטן עובר כמו שהוא — RM-0065", () => {
    // 11 ס"מ, פס 40 מ"מ. `regular` הוא comfort. עד כה חזר 125.0 בשקט.
    const L = stripLengthMm(cuff({ circ: "110", fit: "regular", braceletWidth: 40 }));
    expect(L).toBeCloseTo(104.4, 1);
  });

  it("שתי מידות קטנות שונות אינן מקבלות את אותו אורך", () => {
    // זה מה שהחיתוך עשה: כל היקף מתחת ל-130 מ"מ קרס לאותו פס בדיוק, ולכן
    // המידה שהלקוחה מדדה נעלמה בלי סימן.
    const a = stripLengthMm(cuff({ circ: "100", fit: "regular", braceletWidth: 40 }));
    const b = stripLengthMm(cuff({ circ: "120", fit: "regular", braceletWidth: 40 }));
    expect(b).toBeGreaterThan(a);
  });

  it("היקף גדול מהטבלה גם הוא אינו נחתך", () => {
    const big = stripLengthMm(cuff({ circ: "240", fit: "loose" }));
    expect(big).toBeGreaterThan(FAB.products.bracelet.lengthHintMm[1]);
  });

  it("פס רחב מאריך את הפריסה", () => {
    const narrow = stripLengthMm(ring({ ringSize: "7", ringWidth: 4 }));
    const wide = stripLengthMm(ring({ ringSize: "7", ringWidth: 18 }));
    expect(wide).toBeGreaterThan(narrow);
  });
});
