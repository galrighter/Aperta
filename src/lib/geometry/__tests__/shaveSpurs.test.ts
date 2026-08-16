import { describe, expect, it } from "vitest";
import { shaveSpurs } from "../shaveSpurs";
import { normalizeSvg } from "../normalize";
import { difference, morphologicalOpen, polygonArea, rectPolygon, union } from "../poly";
import type { MultiPolygon } from "../types";

// קוץ — בליטת מתכת דקה מהרצפה שאינה מחזיקה דבר. מה שנבדק כאן הוא ההבחנה בינה
// לבין גשר (שהסרתו מפרקת את החומר) ולבין הפרנז' של הפתיחה עצמה.

const L = 40, W = 10;
const FLOOR = 0.75;
const OPTS = {
  minMaterialMm: FLOOR,
  minSpurMm2: (FLOOR * FLOOR) / 2,
  maxShavedFraction: 0.01,
};

function design(cutouts: MultiPolygon) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}"><g id="cutouts">` +
    cutouts
      .map((p) => `<path d="${p.map((r) => `M${r.map((q) => q.join(" ")).join("L")}Z`).join("")}" fill="black"/>`)
      .join("") +
    "</g></svg>";
  return normalizeSvg(svg, L, W);
}

const metalOf = (n: { lengthMm: number; widthMm: number; cutUnion: MultiPolygon }) =>
  difference([rectPolygon(0, 0, n.lengthMm, n.widthMm)], n.cutUnion);

/**
 * פס מתכת שמתחתיו חתוך הכול, ומעליו יוצא שן דקה — הצורה של AP-0200 חלופה 4:
 * מתכת בעובי `t` שבולטת `h` מעל המתאר, ואינה נוגעת בשום דבר אחר.
 */
function withSpur(thickness: number, height = 2) {
  const band = rectPolygon(0, 4, L, W);
  const spur = rectPolygon(20 - thickness / 2, 4 - height, 20 + thickness / 2, 4);
  return design(difference([rectPolygon(0, 0, L, W)], union([band], [spur])));
}

describe("shaveSpurs", () => {
  it("מסיר שן מתכת דקה מהרצפה", () => {
    const before = withSpur(0.3);
    const beforeArea = polygonArea(metalOf(before)[0]);
    const { design: after, spurs } = shaveSpurs(before, OPTS);

    expect(after).not.toBe(before);
    expect(spurs).toHaveLength(1);
    expect(spurs[0].widthMm).toBeCloseTo(0.3, 1);
    // ואחרי הגילוח אין עוד מה לגלח: הפתיחה מחזירה את החומר כמו שהוא.
    const metal = metalOf(after);
    expect(metal).toHaveLength(1);
    expect(polygonArea(metal[0])).toBeLessThan(beforeArea);
    expect(difference(metal, morphologicalOpen(metal, FLOOR / 2))
      .filter((p) => polygonArea(p) >= OPTS.minSpurMm2)).toHaveLength(0);
  });

  it("אינו נוגע בשן שרחבה מהרצפה — זו צורה שצוירה", () => {
    const before = withSpur(1.5);
    const { design: after, spurs } = shaveSpurs(before, OPTS);
    expect(spurs).toEqual([]);
    expect(after).toBe(before);
  });

  it("אינו מקהה חוד — הוא דק רק בקצהו", () => {
    // משולש מתכת שיוצא מהפס ומתחדד לנקודה. הפתיחה מסירה ממנו את הקצה, כמו
    // מכל חוד, והשטח שנופל עובר את סף ה-`drawnArea` — ובכל זאת זו צורה
    // שמישהו צייר. מה שמפריד: בבסיסו הוא רחב כרצפה, ולכן הוא שורד את הפתיחה
    // השנייה. ההבחנה המקבילה ב-`thickenBridges` היא זו שמנעה ממנו לסמן את כל
    // הקווים הפנימיים של ה-M.
    const band = rectPolygon(0, 4, L, W);
    const point: MultiPolygon = [[[[18, 4], [22, 4], [20, 0.5]]]];
    const before = design(difference([rectPolygon(0, 0, L, W)], union([band], point)));
    const { design: after, spurs } = shaveSpurs(before, OPTS);
    expect(spurs).toEqual([]);
    expect(after).toBe(before);
  });

  it("אינו מגלח גשר — הסרתו הייתה מפרקת את החומר", () => {
    // הצורה של `thickenBridges` אחרי שעשה את שלו: אי שמחובר בפס **ברוחב
    // הרצפה בדיוק**, כלומר בדיוק מה שפתיחה בדיסק ברוחב הזה מוחקת עד לקו. בלי
    // שער הקשירות השלב הזה היה מגלח את מה שהשלב שלפניו הוסיף.
    const cut = [rectPolygon(10, 2, 30, 8)];
    const island = [rectPolygon(15, 3.5, 25, 6.5)];
    const bridge = [rectPolygon(20 - FLOOR / 2, 2, 20 + FLOOR / 2, 4)];
    const before = design(difference(cut, union(island, bridge)));
    expect(metalOf(before)).toHaveLength(1);

    const { design: after, spurs } = shaveSpurs(before, OPTS);
    expect(spurs).toEqual([]);
    expect(after).toBe(before);
  });

  it("אינו משכתב פינה קמורה על רעש העיגול של הפתיחה", () => {
    // עיצוב נקי — מלבן חתוך מפס. הפתיחה מגלחת מכל פינה קמורה
    // r²(1−π/4) ≈ 0.054·min², סדר גודל מתחת לסף, ולכן שום דבר לא זז.
    const before = design([rectPolygon(10, 3, 30, 7)]);
    const { design: after, spurs } = shaveSpurs(before, OPTS);
    expect(spurs).toEqual([]);
    expect(after).toBe(before);
  });

  it("מסרב כשהגילוח היה משכתב את הפריט", () => {
    const before = withSpur(0.3);
    const { design: after, spurs } = shaveSpurs(before, { ...OPTS, maxShavedFraction: 0 });
    expect(spurs).toEqual([]);
    expect(after).toBe(before);
  });

  it("רצפה לא חיובית מכבה את השלב", () => {
    const before = withSpur(0.3);
    expect(shaveSpurs(before, { ...OPTS, minMaterialMm: 0 }).design).toBe(before);
  });
});

/**
 * AP-0200, חלופה 4 — הקוץ שדווח (16.8), כפי שהוא שמור ב-
 * `design_versions.candidates`. שני האזורים העליונים של הרקע נעצרים ב-‎33.668
 * וב-‎34.106, ובין השניים נשארת שערת מתכת שמגיעה עד לשפת הפס.
 *
 * הוולידציה החזירה `pass` על כל חמש הבדיקות, והשערה הופיעה על מסך התוצאה.
 */
const AP0200_CANDIDATE_4 =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54.4 6.7"><g id="cutouts">` +
  `<path d="M0 0L33.668 0L33.592 0.061L32.957 0.061L32.776 0.121L32.459 0.121L32.232 0.182L31.529 0.301L31.693 0.349L33.017 0.348L33.371 0.354L32.984 0.403L28.379 0.741L24.702 1.394L21.004 1.936L19.977 1.936L19.871 1.981L15.051 1.966L14.945 1.921L7.782 1.86L6.468 1.8L3.037 1.785L2.932 1.739L0.665 1.724L0.393 1.8L0.227 1.981L0.082 2.474L0.06 2.964L0 3.025L0 0Z" fill="black"/>` +
  `<path d="M27.548 4.991L28.756 4.265L30.127 3.628L31.507 3.1L33.275 2.526L36.01 3.161L37.111 3.494L38.177 3.904L39.403 4.474L39.494 4.568L39.471 4.832L39.239 4.961L32.111 4.961L30.63 5.021L28.504 5.021L28.296 4.925L28.228 4.706L28.361 4.503L27.548 4.991Z" fill="black"/>` +
  `<path d="M34.106 0L54.4 0L54.4 2.42L54.324 2.359L54.236 2.082L54.083 1.86L53.91 1.707L53.69 1.603L48.28 1.618L48.144 1.573L46.285 1.558L45.726 1.482L45.318 1.482L45.182 1.437L44.517 1.422L40.698 1.021L41.346 1.05L40.528 0.877L38.533 0.605L36.478 0.257L36.161 0.242L35.98 0.182L35.118 0.121L34.967 0.061L34.161 0.061L34.106 0Z" fill="black"/>` +
  `</g></svg>`;

describe("shaveSpurs על AP-0200", () => {
  it("מסיר את השערה שדווחה, ורק אותה", () => {
    const before = normalizeSvg(AP0200_CANDIDATE_4, 54.4, 6.7);
    const beforeMetal = polygonArea(metalOf(before)[0]);
    const { design: after, spurs } = shaveSpurs(before, OPTS);

    expect(spurs).toHaveLength(1);
    const [spur] = spurs;
    // ‎2.02×0.29 מ"מ — פחות מחצי מהרצפה בעובי, בשפה העליונה של הפס.
    expect(spur.widthMm).toBeCloseTo(2.02, 1);
    expect(spur.heightMm).toBeLessThan(FLOOR / 2);
    expect(spur.y).toBeLessThan(0.5);

    // מה שהוסר הוא שבריר מהמתכת — זה ניקוי, לא עיצוב אחר.
    const afterMetal = polygonArea(metalOf(after)[0]);
    expect((beforeMetal - afterMetal) / beforeMetal).toBeLessThan(0.005);
    expect(metalOf(after)).toHaveLength(1);
  });
});
