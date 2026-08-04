import { describe, expect, it } from "vitest";
import { frameCutoutsDims } from "../frameCutouts";
import { difference, rectPolygon } from "../poly";
import type { LetterBridge } from "../restoreBridges";
import type { DesignDims } from "../validate";
import type { MultiPolygon } from "../types";

/**
 * תוכנית הגשרים מול המסגרת שנמסרה בפועל.
 *
 * ההערה מעל `BridgePlan` הבטיחה ש"אלה אותן קואורדינטות שהמסגור עובד בהן". לציר
 * האורך זה נכון — הוא נמתח תמיד אל מה שהוזמן — ולציר הרוחב לא: כשהיחס שהמודל
 * צייר נופל בתוך `WIDTH_TOLERANCE`, המסגרת מקבלת את הרוחב האחיד. התוכנית נמדדה
 * על הרוחב שהוזמן, ולכן פיגרה אחריו.
 */

const ORDERED_W = 18;
const DRAWN_W = 18.72; // +4% — בתוך הטווח, ולכן זה הרוחב שיימסר
const K = DRAWN_W / ORDERED_W;
const L = 60;

/** פס עם חיתוך מלבני שבתוכו אי מתכת — הצורה של חלל אות אחרי המעקב. */
function withIsland(cut: [number, number, number, number], island: [number, number, number, number]) {
  const cutouts: MultiPolygon = difference(
    [rectPolygon(cut[0], cut[1], cut[2], cut[3])],
    [rectPolygon(island[0], island[1], island[2], island[3])],
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${DRAWN_W}"><g id="cutouts">` +
    cutouts
      .map((p) => `<path d="${p.map((r) => `M${r.map((q) => q.join(" ")).join("L")}Z`).join("")}" fill="black"/>`)
      .join("") +
    "</g></svg>"
  );
}

const dims: DesignDims = { productType: "bracelet", lengthMm: L, widthMm: ORDERED_W, thicknessMm: 1.5 };

// האי יושב במרכז הפס שצויר. הקואורדינטה שלו היא במרחב **שאחרי** המסגור.
const ISLAND_CY = DRAWN_W / 2;
const svg = withIsland([20, 4, 40, DRAWN_W - 4], [29, ISLAND_CY - 0.5, 31, ISLAND_CY + 0.5]);

/** אותו חלל, כפי שהוא נמדד על הפס שהוזמן — כלומר מחולק ב-K. */
const planned: LetterBridge = {
  char: "e",
  counter: [29, (ISLAND_CY - 0.5) / K, 31, (ISLAND_CY + 0.5) / K],
  rects: [[29.6, 3, 30.4, ISLAND_CY / K]],
  widthMm: 0.8,
};

describe("תוכנית הגשרים מועברת למרחב שאחרי המסגור", () => {
  it("הרוחב אכן זז — אחרת אין מה לבדוק כאן", () => {
    expect(frameCutoutsDims(dims, svg).widthMm).toBeCloseTo(DRAWN_W, 2);
  });

  it("החלל מזוהה כאות, במרחק אפס — לא במרחק הזליגה", () => {
    const { bridges } = frameCutoutsDims(dims, svg, { letterBridges: [planned] });
    const letter = bridges.find((b) => b.kind === "letter");
    expect(letter).toBeDefined();
    expect(letter).toMatchObject({ char: "e" });
    // בלי ההעברה, מרכז החלל בתוכנית נשאר על 9.0 בעוד האי יושב על 9.36 —
    // התאמה במרחק ~0.36 מ"מ, מול סובלנות של 0.5. עדיין נתפס, אבל
    // `matchLetter` בוחרת את **הקרוב ביותר**, ובשדה עם שני חללים סמוכים
    // המרווח הזה מספיק כדי להצמיד את האי לאות השכנה.
    expect(letter!.matchMm).toBeLessThan(0.05);
  });

  it("רוחב הגשר נשאר מידת ייצור ולא מתכווץ עם המסגרת", () => {
    // המלבן זז, גובהו נשמר. כיווץ ב-4% היה מדלל אותו מתחת לרצפה בשקט —
    // הענף של גשרי האות מצייר את המלבנים כמו שהם ואינו בודק רצפה.
    const { bridges } = frameCutoutsDims(dims, svg, { letterBridges: [planned] });
    expect(bridges.find((b) => b.kind === "letter")!.bridgeMm).toBe(0.8);
  });

  it("כשהרוחב הוא בדיוק מה שהוזמן, התוכנית עוברת כמו שהיא", () => {
    // מחוץ לטווח הרוחב חוזר למוזמן, k=1, ואין מה להעביר. זה הרוב בייצור.
    const square = withIsland([20, 4, 40, DRAWN_W - 4], [29, ISLAND_CY - 0.5, 31, ISLAND_CY + 0.5]);
    const narrow: DesignDims = { ...dims, widthMm: 30 }; // 18.72 רחוק מ-30
    expect(frameCutoutsDims(narrow, square).widthMm).toBe(30);
  });
});
