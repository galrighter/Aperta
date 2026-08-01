import { describe, expect, it } from "vitest";
import { restoreBridges, type LetterBridge } from "../restoreBridges";
import { normalizeSvg } from "../normalize";
import { difference, rectPolygon } from "../poly";
import type { MultiPolygon } from "../types";

// אי מתכת שחוזר מהמעקב נגשר במקום להימחק. מה שנבדק כאן הוא ההכרעה: מתי מחזירים
// גשר שאנחנו חתכנו, מתי מחברים לנקודה הקרובה, ומתי בכל זאת מוחקים.

const L = 40, W = 10;
const OPTS = { ornamentBridgeMm: 1.5, maxSpanMm: 2, maxDroppedFraction: 0.1 };

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
    expect(records[0].bridgeMm).toBe(1.5);
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
    expect(records).toEqual([]);
  });
});
