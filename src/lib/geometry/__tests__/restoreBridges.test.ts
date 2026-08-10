import { describe, expect, it } from "vitest";
import { restoreBridges, scaleLetterBridges, type LetterBridge } from "../restoreBridges";
import { normalizeSvg } from "../normalize";
import { difference, rectPolygon } from "../poly";
import type { MultiPolygon } from "../types";
import type { Box } from "@/lib/text/stencil";

// אי מתכת שחוזר מהמעקב נגשר במקום להימחק. מה שנבדק כאן הוא ההכרעה: מתי מחזירים
// גשר שאנחנו חתכנו, מתי מחברים לנקודה הקרובה, ומתי בכל זאת מוחקים.

const L = 40, W = 10;
const OPTS = { ornamentBridgeMm: 1.5, minBridgeMm: 0.75, maxSpanMm: 2, maxDroppedFraction: 0.1 };

/** פס עם חיתוך מלבני שבתוכו אי מתכת — הצורה של חלל אות אחרי המעקב. */
function withIsland(cut: [number, number, number, number], island: [number, number, number, number]) {
  const cutouts: MultiPolygon = difference(
    [rectPolygon(cut[0], cut[1], cut[2], cut[3])],
    [rectPolygon(island[0], island[1], island[2], island[3])],
  );
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}"><g id="cutouts">` +
    cutouts.map((p) => `<path d="${p.map((r) => `M${r.map((q) => q.join(" ")).join("L")}Z`).join("")}" fill="black"/>`).join("") +
    "</g></svg>";
  return normalizeSvg(svg, L, W);
}

/** כמה רכיבי מתכת נפרדים יש — 1 פירושו שהכול מחובר וניתן לייצור. */
const components = (n: { lengthMm: number; widthMm: number; cutUnion: MultiPolygon }) =>
  difference([rectPolygon(0, 0, n.lengthMm, n.widthMm)], n.cutUnion).length;

describe("restoreBridges", () => {
  it("puts back the bridge we cut, where we cut it", () => {
    const design = withIsland([10, 3, 20, 7], [13, 4.5, 15, 5.5]);
    expect(components(design)).toBe(2);
    // הגשר שחתכנו: מלמעלה, כמו בלטינית — מהמתכת שמעל החיתוך אל תוך החלל.
    const letter: LetterBridge = {
      char: "e",
      counter: [13, 4.5, 15, 5.5],
      rects: [[13.6, 2.5, 14.4, 5]],
      widthMm: 0.8,
    };
    const { design: fixed, records } = restoreBridges(design, { ...OPTS, letterBridges: [letter] });
    expect(components(fixed)).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "letter", char: "e", bridgeMm: 0.8 });
    expect(records[0].matchMm).toBeLessThan(0.01);
  });

  it("ignores a cut bridge that belongs to a different letter", () => {
    const design = withIsland([10, 3, 20, 7], [13, 4.5, 15, 5.5]);
    // חלל של אות אחרת, רחוק — אסור שיימשוך אליו את האי הזה.
    const elsewhere: LetterBridge = {
      char: "o", counter: [30, 4.5, 32, 5.5], rects: [[30.6, 2.5, 31.4, 5]], widthMm: 0.8,
    };
    const { records } = restoreBridges(design, { ...OPTS, letterBridges: [elsewhere] });
    expect(records[0].kind).toBe("ornament");
  });

  it("links an ornament island to the nearest point when it is close", () => {
    // האי במרחק 1.5 מ"מ מקצה החיתוך — מתחת לסף.
    const design = withIsland([10, 3, 20, 7], [14, 4.5, 16, 5.5]);
    const { design: fixed, records } = restoreBridges(design, OPTS);
    expect(components(fixed)).toBe(1);
    expect(records[0].kind).toBe("ornament");
    expect(records[0].spanMm).toBeCloseTo(1.5, 1);
    // האי הוא 2x1 מ"מ, ולכן הגשר נגזר ממנו ולא מ-`ornamentBridgeMm`: 1.5 מ"מ
    // על צלע של מילימטר הוא לא גשר אלא בליעה.
    expect(records[0].bridgeMm).toBe(0.75);
  });

  it("never draws an ornament bridge wider than the island it holds", () => {
    // נקודה קטנה — בדיוק המקרה שהתלונה הגיעה עליו. גשר `ornamentBridgeMm`
    // עליה היה רחב ממנה פי כמעט שניים.
    const design = withIsland([10, 3, 20, 7], [14.6, 4.5, 15.4, 5.3]);
    const { records } = restoreBridges(design, OPTS);
    expect(records[0].kind).toBe("ornament");
    expect(records[0].bridgeMm!).toBeLessThanOrEqual(Math.min(records[0].widthMm, records[0].heightMm));
  });

  it("drops an island too narrow for even the minimum bridge", () => {
    // 0.4 מ"מ: כל גשר שיחזיק אותו רחב ממנו. אין מה לגשר — מוחקים.
    const design = withIsland([10, 3, 20, 7], [14.8, 4.8, 15.2, 5.2]);
    const { records } = restoreBridges(design, OPTS);
    expect(records[0].kind).toBe("dropped");
  });

  it("bridges every letter island even when together they pass the drop budget", () => {
    // שנים־עשר חללים קטנים, שיחד הם יותר מ-10% מהמתכת. הבלימה נועדה לרכיב
    // חריג יחיד; כאן היא הותירה עיצוב שכל אותיותיו מרחפות ובלי אף גשר.
    const cuts: MultiPolygon = [];
    for (let i = 0; i < 12; i++) {
      const x = 2 + i * 3;
      cuts.push(...difference(
        [rectPolygon(x, 1, x + 2.6, 9)],
        [rectPolygon(x + 0.6, 3, x + 2, 7)],
      ));
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}"><g id="cutouts">` +
      cuts.map((p) => `<path d="${p.map((r) => `M${r.map((q) => q.join(" ")).join("L")}Z`).join("")}" fill="black"/>`).join("") +
      "</g></svg>";
    const design = normalizeSvg(svg, L, W);
    expect(components(design)).toBe(13);
    const { design: fixed, records } = restoreBridges(design, OPTS);
    expect(records).toHaveLength(12);
    expect(records.every((r) => r.kind === "ornament")).toBe(true);
    expect(components(fixed)).toBe(1);
  });

  it("drops an island whose nearest metal is too far to bridge", () => {
    // חיתוך רחב יותר: מרכזו רחוק מכל מתכת, וגשר לשם היה חוצה את העיצוב.
    const design = withIsland([5, 1, 35, 9], [19, 4.5, 21, 5.5]);
    const { design: fixed, records } = restoreBridges(design, OPTS);
    expect(components(fixed)).toBe(1);
    expect(records[0].kind).toBe("dropped");
    expect(records[0].spanMm!).toBeGreaterThan(OPTS.maxSpanMm);
    // נמחק פירושו שהחלל התאחד עם החיתוך — אין יותר מתכת שם.
    expect(fixed.canonicalSvg).not.toBe(design.canonicalSvg);
  });

  it("leaves a design without islands exactly as it was", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}">` +
      `<g id="cutouts"><path d="M12 4L18 4L18 6L12 6Z" fill="black"/></g></svg>`;
    const n = normalizeSvg(svg, L, W);
    const { design, records } = restoreBridges(n, OPTS);
    // אותו אובייקט, כדי שהמסגור ידלג על ולידציה נוספת.
    expect(design).toBe(n);
    expect(records).toEqual([]);
  });

  it("does not touch a design where the detached part is most of the piece", () => {
    // לא "אי" אלא עיצוב שנשבר לשניים. לא מגשרים ולא מוחקים — זה לא רעש.
    const design = withIsland([1, 1, 39, 9], [2, 2, 38, 8]);
    const { design: same, records } = restoreBridges(design, OPTS);
    expect(same).toBe(design);
    // אבל כן מדווחים: "לא נגענו" בלי שורה ביומן נראה בדיוק כמו "לא רץ".
    expect(records).toEqual([expect.objectContaining({ kind: "kept" })]);
  });
});

// העברת התוכנית בין שתי מסגרות — מה שמסלול האימוץ ("להזמין כזה") עושה לפני
// שהוא מוסר את התוכנית למסגור. הכלל היחיד שנשמר כאן, ובגללו זו פונקציה ולא
// שלוש שורות בכל קורא: **החלל נמתח, עובי הגשר לא.**
describe("scaleLetterBridges", () => {
  /** גשר לטיני: נחתך מלמעלה, ולכן הפס אנכי ועובייו על ציר ה-X. */
  const latin: LetterBridge = {
    char: "e", counter: [13, 4.5, 15, 5.5], rects: [[13.6, 2.5, 14.4, 5]], widthMm: 0.8,
  };
  /** גשר עברי: נחתך מהצד, ולכן הפס אופקי ועובייו על ציר ה-Y. */
  const hebrew: LetterBridge = {
    char: "ם", counter: [13, 4.5, 15, 5.5], rects: [[11.5, 4.6, 14.0, 5.4]], widthMm: 0.8,
  };
  const width = ([x0, , x1]: Box) => Math.round((x1 - x0) * 1e6) / 1e6;
  const height = ([, y0, , y1]: Box) => Math.round((y1 - y0) * 1e6) / 1e6;

  it("מותח את תיבת החלל בשני הצירים — היא מתארת גאומטריה שנמתחה", () => {
    const [b] = scaleLetterBridges([latin], 0.9, 1.2);
    expect(b.counter).toEqual([13 * 0.9, 4.5 * 1.2, 15 * 0.9, 5.5 * 1.2]);
  });

  it("שומר על עובי הגשר הלטיני (ציר X) ומותח את אורכו", () => {
    const [b] = scaleLetterBridges([latin], 0.9, 0.9);
    // 0.8 מ"מ הוא מידת ייצור. כיווץ ב-10% היה מוריד אותו ל-0.72 בשקט, מתחת
    // לרצפה — והענף של גשרי האות מצייר את המלבנים כמו שהם ואינו בודק רצפה.
    expect(width(b.rects[0])).toBe(0.8);
    expect(height(b.rects[0])).toBe(height(latin.rects[0]) * 0.9);
  });

  it("שומר על עובי הגשר העברי (ציר Y) — הכיוון נגזר מ-widthMm ולא מנוחש", () => {
    const [b] = scaleLetterBridges([hebrew], 0.9, 0.9);
    expect(height(b.rects[0])).toBe(0.8);
    expect(width(b.rects[0])).toBe(width(hebrew.rects[0]) * 0.9);
  });

  it("מזיז את הגשר יחד עם החלל — אחרת הוא נחתך במקום הלא נכון", () => {
    const [b] = scaleLetterBridges([latin], 0.5, 2);
    const cx = (b.rects[0][0] + b.rects[0][2]) / 2;
    expect(cx).toBeCloseTo(((13.6 + 14.4) / 2) * 0.5, 6);
  });

  it("קנה מידה 1:1 מחזיר את התוכנית כמו שהיא", () => {
    expect(scaleLetterBridges([latin, hebrew], 1, 1)).toEqual([latin, hebrew]);
  });

  it("התוכנית המועברת עדיין מזוהה כאות, והגשר נחתך ברוחב המלא", () => {
    // זה מה שהאימוץ באמת קונה. מסגרת המקור היא 40×10, והמזמין מקבל 36×10 —
    // אורך קצר ב-10%, בדיוק המצב שהפיל את עיצוב 99.
    const SX = 0.9;
    const planned: LetterBridge = {
      char: "e", counter: [13, 4.5, 15, 5.5], rects: [[13.6, 2.5, 14.4, 5]], widthMm: 0.8,
    };
    // אותו עיצוב, מותח ב-SX על ציר האורך.
    const s = (v: number) => v * SX;
    const design = withIsland(
      [s(10), 3, s(20), 7],
      [s(13), 4.5, s(15), 5.5],
    );
    const [moved] = scaleLetterBridges([planned], SX, 1);
    const { records } = restoreBridges(design, { ...OPTS, letterBridges: [moved] });
    expect(records[0]).toMatchObject({ kind: "letter", char: "e" });
    expect(records[0].matchMm).toBeLessThan(0.01);
    // ובלי ההעברה, אותו אי לא נמצא כאות בכלל — המרכז זז 1.4 מ"מ, מעל הסובלנות.
    const { records: blind } = restoreBridges(design, { ...OPTS, letterBridges: [planned] });
    expect(blind[0].kind).toBe("ornament");
  });
});
