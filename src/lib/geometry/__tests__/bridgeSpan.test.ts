import { describe, expect, it } from "vitest";
import { bridgeRect } from "../bridgeSpan";
import { difference, rectPolygon } from "../poly";
import type { MultiPolygon, Polygon } from "../types";

// שני קצות הגשר, נמדדים במקום מנוחשים. הצורה שהבדיקות עובדות עליה היא `8`
// מופשטת: מסגרת מתכת, בתוכה שני חללים סגורים שביניהם גזע דיו — בדיוק המצב שבו
// "התיבה שמכילה את החלל" מחזירה את הטבעת ולא את האות.

const FRAME = 40;
const box = (x0: number, y0: number, x1: number, y1: number): Polygon => rectPolygon(x0, y0, x1, y1);

/**
 * הגוף — המתכת שמחוץ לאות. **לא** כולל את החללים שלה: הם האיים, וזו כל
 * ההבחנה שהמדידה נשענת עליה.
 */
const bodyOutside = (glyph: Polygon): MultiPolygon =>
  difference([box(0, 0, FRAME, FRAME)], [glyph]);

describe("bridgeRect", () => {
  // אות בצורת `8`: המתאר החיצוני מ-10 עד 30, ובתוכו שני חללים. הגזע האמצעי
  // (19→20) **דק מהעליון** (10→12) בכוונה: אילו האי השני נחשב יעד לגיטימי,
  // הוא היה הקרוב ביותר — וזה בדיוק הגשר שנחתך ב-AP-0097.
  const upper = box(13, 12, 27, 19);
  const main = bodyOutside(box(10, 10, 30, 30));

  it("crosses the ink to the body, not to the island on the other side", () => {
    const rect = bridgeRect(upper, main, { sideways: false, centre: 20, width: 1 })!;
    expect(rect).not.toBeNull();
    const ys = rect[0].map((p) => p[1]);
    // מהמתכת שמעל הדיו (10) ועד לתוך החלל העליון (12+) — כלפי מעלה, למרות
    // שהגזע האמצעי קצר יותר.
    expect(Math.min(...ys)).toBeLessThan(10);
    expect(Math.max(...ys)).toBeGreaterThan(12);
    expect(Math.max(...ys)).toBeLessThan(19);
  });

  it("takes the shorter side", () => {
    // גזע עליון עבה (10→16), גזע תחתון דק (28→30): הגשר יורד ולא עולה.
    const island = box(13, 16, 27, 28);
    const rect = bridgeRect(island, main, { sideways: false, centre: 20, width: 1 })!;
    const ys = rect[0].map((p) => p[1]);
    expect(Math.min(...ys)).toBeGreaterThan(16); // לא חצה את הגזע העבה
    expect(Math.max(...ys)).toBeGreaterThan(30); // יצא מתחת לדיו
  });

  it("crosses sideways when asked, for Hebrew", () => {
    const rect = bridgeRect(upper, main, { sideways: true, centre: 15, width: 1 })!;
    const xs = rect[0].map((p) => p[0]);
    const ys = rect[0].map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1, 6);
  });

  it("returns null rather than a bridge that misses the island", () => {
    // רצועה שעוברת לצד האי. אין מה לחתוך, והקורא צריך לדעת את זה.
    expect(bridgeRect(upper, main, { sideways: false, centre: 5, width: 1 })).toBeNull();
  });

  it("returns null when there is no body to reach", () => {
    expect(bridgeRect(upper, [], { sideways: false, centre: 20, width: 1 })).toBeNull();
  });
});
