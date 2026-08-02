import { describe, expect, it } from "vitest";
import { thickenBridges } from "../thickenBridges";
import { normalizeSvg } from "../normalize";
import { difference, morphologicalOpen, rectPolygon, union } from "../poly";
import type { MultiPolygon } from "../types";

// גשר שהמודל צייר בעצמו ויצא דק מהמינימום. מה שנבדק כאן הוא ההבחנה בין גשר
// אמיתי לבין טריז שמתחדד — ההבחנה שהנפילה עליה סימנה את כל הקווים הפנימיים
// של ה-M ב-RM-0068.

const L = 40, W = 10;
const FLOOR = 0.75;
const OPTS = { minBridgeMm: FLOOR, maxAddedFraction: 0.02 };

function design(cutouts: MultiPolygon) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}"><g id="cutouts">` +
    cutouts
      .map((p) => `<path d="${p.map((r) => `M${r.map((q) => q.join(" ")).join("L")}Z`).join("")}" fill="black"/>`)
      .join("") +
    "</g></svg>";
  return normalizeSvg(svg, L, W);
}

/**
 * חיתוך מלבני שבתוכו אי מתכת, שמחובר למתכת שמסביב בצוואר ברוחב `neck`.
 * זו הצורה של חלל אות שהמודל צייר עם גשר דק מדי.
 */
function withNeck(neck: number) {
  const cut = [rectPolygon(10, 3, 20, 7)];
  const island = [rectPolygon(13, 4.5, 17, 5.5)];
  // הצוואר: פס מתכת מהחיתוך העליון אל האי.
  const bridge = [rectPolygon(15 - neck / 2, 3, 15 + neck / 2, 5)];
  return design(difference(cut, union(island, bridge)));
}

/** הרוחב של המקום הרחב ביותר בקבוצה — 2r של הדיסק הגדול ביותר שנכנס. */
const fits = (mp: MultiPolygon, widthMm: number) => morphologicalOpen(mp, widthMm / 2).length > 0;

const metalOf = (n: { lengthMm: number; widthMm: number; cutUnion: MultiPolygon }) =>
  difference([rectPolygon(0, 0, n.lengthMm, n.widthMm)], n.cutUnion);

describe("thickenBridges", () => {
  it("raises a bridge the model drew too thin up to the floor", () => {
    const before = withNeck(0.3);
    // לפני: הגשר לא מכיל דיסק ברוחב הרצפה.
    expect(fits(morphologicalOpen(metalOf(before), FLOOR / 2), FLOOR)).toBe(true);
    const { design: after, records } = thickenBridges(before, OPTS);

    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe("thickened");
    expect(records[0].bridgeMm).toBe(FLOOR);
    expect(records[0].fromMm).toBeLessThan(FLOOR);
    // אחרי: הכול גוף אחד — הפתיחה כבר לא מנתקת את האי.
    expect(morphologicalOpen(metalOf(after), FLOOR / 2).length).toBe(1);
  });

  it("leaves a bridge that already meets the floor alone", () => {
    const before = withNeck(1.2);
    const { design: after, records } = thickenBridges(before, OPTS);
    expect(records).toHaveLength(0);
    expect(after).toBe(before);
  });

  it("does not touch a tapering wedge — the M false positive", () => {
    // טריז מתכת שמתחדד לקצה: רחב למטה, נגמר בנקודה. אין לו צד שני, ולכן הוא
    // אינו גשר — למרות שכל חתך לרוחבו קוטע ממנו קצה סגור.
    const cut: MultiPolygon = difference(
      [rectPolygon(10, 2, 20, 8)],
      [[[[12, 7], [18, 7], [15, 3]]]],
    );
    const before = design(cut);
    const { design: after, records } = thickenBridges(before, OPTS);
    expect(records).toHaveLength(0);
    expect(after).toBe(before);
  });

  it("adds one bridge per island, not one per neck", () => {
    // אי שמוחזק בשני צווארים דקים. די בהרחבת אחד כדי שיחזיק.
    const cut = [rectPolygon(10, 3, 20, 7)];
    const island = [rectPolygon(13, 4.5, 17, 5.5)];
    const necks = union(
      [rectPolygon(14.8, 3, 15.2, 5)],
      [rectPolygon(15.8, 5, 16.2, 7)],
    );
    const before = design(difference(cut, union(island, necks)));
    const { records } = thickenBridges(before, OPTS);
    expect(records).toHaveLength(1);
  });

  it("leaves a design with no islands untouched", () => {
    const before = design([rectPolygon(10, 3, 20, 7)]);
    const { design: after, records } = thickenBridges(before, OPTS);
    expect(records).toHaveLength(0);
    expect(after).toBe(before);
  });

  it("refuses when the fix would rewrite the piece", () => {
    const before = withNeck(0.3);
    const { design: after, records } = thickenBridges(before, { ...OPTS, maxAddedFraction: 0 });
    expect(records).toHaveLength(0);
    expect(after).toBe(before);
  });
});
