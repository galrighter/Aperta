import { describe, it, expect } from "vitest";
import { convertTextRequests } from "../textToPath";
import { validateDesign } from "@/lib/geometry/validate";
import { polygonsBBox, textToStencil } from "../stencil";
import { FONT_IDS } from "../fonts";
import { difference, multiPolygonArea, rectPolygon } from "@/lib/geometry/poly";

import { FAB, resolveFab } from "@/lib/fabrication.config";

const DIMS = { productType: "bracelet" as const, lengthMm: 160, widthMm: 15, thicknessMm: 1.5 };

const svgWith = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 15"><g id="cutouts">${inner}</g></svg>`;

describe("text-to-path with auto-bridging", () => {
  it("converts a Hebrew name with closed letters into paths that pass V3 (no falling islands)", async () => {
    // "סם" — שתי אותיות עם קונטור סגור; בלי גישור האמצע היה נופל
    const raw = svgWith(`<text-request content="סם" x="80" y="7.5" height="6" align="middle"/>`);
    const converted = await convertTextRequests(raw, DIMS);
    expect(converted).not.toContain("text-request");
    expect(converted).toContain("<path");
    const { report } = validateDesign(converted, DIMS);
    const v3 = report.checks.find((c) => c.check === "V3")!;
    expect(v3.status).toBe("pass");
    const v2 = report.checks.find((c) => c.check === "V2")!;
    expect(v2.status).toBe("pass");
  });

  it("converts Latin text with counters (O, A)", async () => {
    const raw = svgWith(`<text-request content="OA" x="80" y="7.5" height="6" align="middle"/>`);
    const converted = await convertTextRequests(raw, DIMS);
    const { report } = validateDesign(converted, DIMS);
    expect(report.checks.find((c) => c.check === "V3")!.status).toBe("pass");
  });

  it("leaves SVG without text-request untouched", async () => {
    const raw = svgWith(`<circle cx="80" cy="7.5" r="3"/>`);
    expect(await convertTextRequests(raw, DIMS)).toBe(raw);
  });

  it("drops malformed text-request elements", async () => {
    const raw = svgWith(`<text-request content="" x="80"/><circle cx="80" cy="7.5" r="3"/>`);
    const converted = await convertTextRequests(raw, DIMS);
    expect(converted).not.toContain("text-request");
  });
});

// רוחב הגשר נגזר מהקונטור שהוא מחזיק. גשר ברוחב המינימום לייצור (1.5 מ"מ) על
// קונטור של `e` בגובה 6 מ"מ (0.85 מ"מ) לא גישר אלא בלע אותו ואכל את הגזעים —
// והאות שחזרה מהמודל הייתה שבורה, כי כך היא נמסרה לו.
describe("bridge width against the counter it holds", () => {
  const fab = resolveFab(1.5, "ring");
  const LETTER_MIN = FAB.minLetterBridgeMm;

  it("keeps the letter, not just the island", async () => {
    for (const ch of ["e", "a", "o", "R", "ס"]) {
      for (const heightMm of [6, 12]) {
        const plain = await textToStencil(ch, 0, 0, heightMm, "start", 0);
        const bridged = await textToStencil(
          ch, 0, 0, heightMm, "start", fab.minBridgeCut, {}, LETTER_MIN,
        );
        const kept = multiPolygonArea(bridged.polygons) / multiPolygonArea(plain.polygons);
        expect(kept, `${ch} at ${heightMm}mm`).toBeGreaterThan(0.85);
      }
    }
  });

  it("never goes below the letter minimum, however small the counter is", async () => {
    const { tightBridges } = await textToStencil(
      "e", 0, 0, 6, "start", fab.minBridgeCut, {}, LETTER_MIN,
    );
    // החלל של e בגובה 6 מ"מ צר מכדי להחזיק גשר יחסי — הגשר יושב על הרצפה.
    expect(tightBridges).toHaveLength(1);
    expect(tightBridges[0].widthMm).toBe(LETTER_MIN);
    // ...והרצפה תופסת יותר מהיחס שהיה נבחר אילו היה מקום.
    expect(tightBridges[0].widthMm / tightBridges[0].counterMm).toBeGreaterThan(0.4);
  });

  it("stays silent when the counter has room for the letter minimum", async () => {
    // אות גדולה: היחס לבדו נותן גשר מעל הרצפה, ואין מה לאשר.
    const big = await textToStencil("o", 0, 0, 12, "start", fab.minBridgeCut, {}, LETTER_MIN);
    expect(big.tightBridges).toEqual([]);
  });

  it("never exceeds the structural minimum either", async () => {
    // הרצפה היא רצפה, לא ברירת מחדל: קונטור גדול מקבל את המינימום המלא ולא יותר.
    const huge = await textToStencil("o", 0, 0, 40, "start", fab.minBridgeCut, {}, LETTER_MIN);
    expect(huge.tightBridges).toEqual([]);
  });

  it("still connects the island — a narrower bridge is still a bridge", async () => {
    // ההצדקה לצמצום: הגשר מחזיק אי, הוא לא נושא עומס. הבדיקה היא שאין חור
    // נפרד שנשאר בתוך האות, כלומר שהקונטור מחובר לחומר שסביבו.
    for (const ch of ["e", "o", "ס"]) {
      const { polygons } = await textToStencil(
        ch, 0, 0, 6, "start", fab.minBridgeCut, {}, LETTER_MIN,
      );
      for (const poly of polygons) expect(poly.length, `${ch} keeps an island`).toBe(1);
    }
  });
});

// כיוון הגשר נקבע לפי הכתב, כי שני הכתבים רוצים הפוך: חריץ בצד מעביר `o`
// ל-`C`, וחריץ מלמעלה/מלמטה מעביר ם׳ ל-ח׳. אין כיוון אחד שנכון לשניהם.
describe("bridge direction by script", () => {
  const fab = resolveFab(1.5, "ring");
  const cut = (ch: string) =>
    textToStencil(ch, 0, 0, 6, "start", fab.minBridgeCut, {}, FAB.minLetterBridgeMm);

  /** האם החלל הסגור נפתח לצד (שמאל/ימין) או למעלה/למטה. */
  async function opensSideways(ch: string): Promise<boolean> {
    const plain = await textToStencil(ch, 0, 0, 6, "start", 0);
    const bridged = await cut(ch);
    // ההפרש בין הלא־מגושר למגושר הוא הרצועה שהוסרה. הצורה שלה מספרת את הכיוון.
    const removed = difference(plain.polygons, bridged.polygons);
    const box = polygonsBBox(removed);
    return box[2] - box[0] > box[3] - box[1];
  }

  it("cuts a Latin counter from above or below, so o stays o", async () => {
    for (const ch of ["o", "e", "a", "R"]) {
      expect(await opensSideways(ch), `${ch} opens vertically`).toBe(false);
    }
  });

  it("cuts a Hebrew counter from the side, so ם stays ם", async () => {
    // זו ההכרעה שנמדדה על שמונה הפנים: חריץ בבר האופקי קורא אות אחרת.
    for (const ch of ["ם", "ס"]) {
      expect(await opensSideways(ch), `${ch} opens sideways`).toBe(true);
    }
  });
});

// **הגשר חייב להגיע למתכת, לא לאי השני.**
//
// עד AP-0097 שני קצות הגשר נוחשו מתיבות חוסמות, ושתי הניחושים טעו:
//
//  · `8` בפנים רבות היא **שתי טבעות שחופפות**, ולא מסלול אחד. "התיבה שמכילה
//    את החלל" הייתה אז הטבעת הפנימית, הקצה החיצון נחת בתוך הדיו — בין שני
//    החללים — והגשר ריתך את שני האיים זה לזה במקום להחזיק אותם.
//  · החלל של `4` הוא משולש. הקצה הפנימי נמדד מקצה התיבה החוסמת, ובמרכז
//    הרוחב — שם הגשר יושב — גבול האי נמוך יותר, ולכן הרצועה לא נגעה בו כלל.
//
// שתיהן נראות תקינות בטבלת הגשרים ביומן ושתיהן משאירות אי שנופל בחיתוך. מה
// שנבדק כאן הוא התוצאה ולא הדרך: אחרי החיתוך המתכת היא גוף אחד.
describe("every counter ends up held, in every face", () => {
  const fab = resolveFab(1.5, "bracelet");

  /** כמה רכיבי מתכת נשארים סביב הכיתוב. 1 = הכול מחובר. */
  const components = (polygons: Awaited<ReturnType<typeof textToStencil>>["polygons"]) => {
    const [x0, y0, x1, y1] = polygonsBBox(polygons);
    const around = [rectPolygon(x0 - 5, y0 - 5, x1 + 5, y1 + 5)];
    return difference(around, polygons).length;
  };

  // `14.8.83` הוא התאריך מ-AP-0097 — `8` על שתי הטבעות ו-`4` על החלל המשולש,
  // כלומר שני הפגמים במחרוזת אחת. `ORD` מוסיף עברית וקערות לטיניות.
  for (const text of ["14.8.83", "ORDם ס"]) {
    for (const fontId of FONT_IDS) {
      it(`holds every island of "${text}" in ${fontId}`, async () => {
        const cut = await textToStencil(
          text, 0, 0, 8, "start", fab.minBridgeCut, { fontId }, FAB.minLetterBridgeMm,
        );
        expect(cut.unbridged, "islands left without a bridge").toBe(0);
        expect(components(cut.polygons), "metal components around the lettering").toBe(1);
      });
    }
  }
});
