import { describe, it, expect } from "vitest";
import { pickClosestRatio, ratioGap, STRETCH_ALERT } from "@/lib/render/ratioGap";
import { ratioChip } from "@/components/admin/RunsLog";
import { NATURAL_RATIO, maxRows, planRender } from "@/lib/render/panels";
import { LANDSCAPE, PORTRAIT, canvasFor } from "@/lib/render/canvas";

// AP-0096: הוזמן צמיד 145.2×5 (יחס 29:1), המודל צייר 6.95:1, והמסגור מתח ×4.2
// עד שקו הא.ק.ג נמעך ונפסל ב"צוואר צר מדי". שום שדה לא אמר את זה — `stretch`
// חושב לכל מועמד ונשמר על הגרסה, אבל לא ברמת ההרצה, ולכן אי אפשר היה לשאול
// כמה מההרצות נמתחות ובכמה.

const cutouts = (lengthMm: number, widthMm: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lengthMm} ${widthMm}"><g id="cutouts"/></svg>`;

describe("the gap between what was ordered and what the model drew", () => {
  it("measures AP-0096", () => {
    expect(ratioGap(cutouts(34.77, 5), { lengthMm: 145.2, widthMm: 5 })).toEqual({
      orderedRatio: 29.04,
      drawnRatio: 6.95,
      stretch: 4.18,
    });
  });

  it("is 1 when the model drew what was ordered", () => {
    expect(ratioGap(cutouts(145.2, 5), { lengthMm: 145.2, widthMm: 5 })?.stretch).toBe(1);
  });

  it("stays out of the way when there is nothing to measure", () => {
    expect(ratioGap(null, { lengthMm: 145.2, widthMm: 5 })).toBeNull();
    expect(ratioGap("<svg/>", { lengthMm: 145.2, widthMm: 5 })).toBeNull();
    expect(ratioGap(cutouts(34.77, 5), { lengthMm: 0, widthMm: 5 })).toBeNull();
  });
});

describe("which panels get offered when more were cut than are shown", () => {
  const panels = [
    { id: "far", svg: cutouts(20, 5) }, // 4:1 — רחוק מ-29
    { id: "close", svg: cutouts(120, 5) }, // 24:1 — הקרוב ביותר
    { id: "mid", svg: cutouts(60, 5) }, // 12:1
    { id: "broken", svg: null }, // בלי viewBox שמיש
  ];
  const ordered = { lengthMm: 145.2, widthMm: 5 };

  it("takes the ones closest to the ordered ratio — the least stretch", () => {
    const picked = pickClosestRatio(panels, (p) => p.svg, ordered, 2);
    expect(picked.map((p) => p.id)).toEqual(["close", "mid"]);
  });

  it("keeps everything when there is nothing to choose between", () => {
    expect(pickClosestRatio(panels, (p) => p.svg, ordered, 6)).toEqual(panels);
  });

  it("sends an unmeasurable panel to the back — it is the first to be cut", () => {
    const picked = pickClosestRatio(panels, (p) => p.svg, ordered, 3);
    expect(picked.map((p) => p.id)).toEqual(["close", "mid", "far"]);
  });
});

describe("the chip in the log", () => {
  it("flags a run that had to be stretched", () => {
    const chip = ratioChip({ orderedRatio: 29.04, plannedRatio: 8.63, drawnRatio: 6.95, stretch: 4.18 });
    expect(chip?.alert).toBe(true);
    expect(chip?.text).toBe("הוזמן 29.04:1 · תוכנן 8.63 · צויר 6.95 · מתיחה ×4.18");
  });

  it("shows a healthy run too — without the background there is no baseline", () => {
    const chip = ratioChip({ orderedRatio: 8.9, plannedRatio: 8.63, drawnRatio: 8.7, stretch: 1.02 });
    expect(chip?.alert).toBe(false);
  });

  it("is absent on runs saved before the measurement existed", () => {
    expect(ratioChip({})).toBeNull();
  });

  it("alerts exactly at the threshold", () => {
    expect(ratioChip({ orderedRatio: 10, stretch: STRETCH_ALERT })?.alert).toBe(true);
  });
});

// מה שהמדידה אמורה לחשוף, כתוב כאן כדי שלא יישכח: על הפריט של AP-0096 התכנון
// לא היה **מסוגל** לספק את היחס שהוזמן, ולא בגלל רזולוציה.
describe("why AP-0096 could not have held its ratio", () => {
  const item = { widthMm: 5, lengthMm: 145.2, minHoleMm: 0.5 };
  const ratio = item.lengthMm / item.widthMm;

  it("chose the canvas by length alone, and that halved the reachable ratio", () => {
    expect(canvasFor(item.lengthMm)).toBe(PORTRAIT);
    // תקרת הפיקסלים מרשה 25 שורות לאורך, אבל גם שם היחס לא מגיע ל-29.
    expect(maxRows(item.widthMm, item.minHoleMm, PORTRAIT)).toBe(25);
    expect(NATURAL_RATIO(25, 1, PORTRAIT)).toBeLessThan(ratio);
    // לרוחב, אותו פריט כמעט פוגע ביחס בתוך תקרת הפיקסלים שלו.
    const capLandscape = maxRows(item.widthMm, item.minHoleMm, LANDSCAPE);
    expect(NATURAL_RATIO(capLandscape, 1, LANDSCAPE) / ratio).toBeGreaterThan(0.9);
  });

  it("used to stop at 6 rows — the display cap; now it produces to the pixel budget", () => {
    const plan = planRender({ ...item, ratio, canvas: PORTRAIT });
    // 6 היה מה שהתצוגה הרשתה, לא מה שהתמונה יכלה לתת. עכשיו הייצור עולה עד
    // תקרת הפיקסלים, והתצוגה נחתכת בנפרד.
    expect(plan.rows).toBe(maxRows(item.widthMm, item.minHoleMm, PORTRAIT));
    expect(plan.offered).toBe(6);
    // וזה מה שזה שווה: המתיחה יורדת מ-×4.2 לפחות מ-×1.6.
    expect(ratio / NATURAL_RATIO(plan.rows, plan.cols, PORTRAIT)).toBeLessThan(1.6);
  });

  it("keeps the resolution promise — the added rows are the ones that cost nothing", () => {
    // הפריט מצויר בקנה מידה `min(לאורך, לרוחב)`, ובפס צר וארוך ציר האורך הוא
    // החסם הרבה אחרי שהשורות נגמרו: 24 שורות חינם, ותקרת ההישרדות 25.
    const alongLength = (PORTRAIT.widthPx * 0.9) / item.lengthMm;
    const free = Math.floor((PORTRAIT.heightPx * 0.5) / (item.widthMm * alongLength));
    expect(free).toBe(24);
    expect(planRender({ ...item, ratio, canvas: PORTRAIT }).rows).toBeLessThanOrEqual(free + 1);
  });
});
