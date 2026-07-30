import { describe, it, expect } from "vitest";
import {
  computeSizing,
  sizeFromBlank,
  neutralRadiusFromBlank,
  nearestUsRingSize,
  US_RING_ID_MM,
  MM_ID_PER_US_SIZE,
} from "../sizing";
import { FAB } from "../fabrication.config";

const T = 1.5;

describe("ring blank length", () => {
  // docs/sizing-fit-review.md §2.3 — t=1.5, K=0.42, פער-מיתר 3 מ"מ, רוחב ≤4
  const table: Array<[string, number]> = [
    ["4", 47.6], ["5", 50.3], ["6", 52.8], ["7", 55.5], ["8", 58.1],
    ["9", 60.5], ["10", 63.3], ["11", 65.9], ["12", 68.5], ["13", 71.1],
  ];

  it.each(table)("US %s → %f mm", (size, expected) => {
    const r = computeSizing({
      product: "ring", thicknessMm: T, widthMm: 4, gapChordMm: 3,
      idMm: US_RING_ID_MM[size],
    });
    expect(r.blankLengthMm).toBeCloseTo(expected, 1);
  });

  it("ברירת המחדל בקונפיג היא בדיוק US 7", () => {
    const p = FAB.products.ring;
    const derived = sizeFromBlank(p.defaultLengthMm, {
      product: "ring", thicknessMm: T, widthMm: 4, gapChordMm: p.defaultGapMm,
    });
    expect(derived.usRingSize).toBe(7);
    expect(derived.nominalIdMm).toBeCloseTo(US_RING_ID_MM["7"], 1);
  });

  it("הערך הישן 54 מ\"מ היה חצי מידה הדוק — הרגרסיה שנסגרה", () => {
    const derived = sizeFromBlank(54, {
      product: "ring", thicknessMm: T, widthMm: 4, gapChordMm: 3,
    });
    expect(derived.usRingSize).toBe(6.5);
  });
});

describe("cuff blank length", () => {
  // docs/sizing-fit-review.md §2.4 — t=1.5, K=0.45, פער-מיתר 25.4 מ"מ, רוחב ≤4
  const table: Array<[number, number, number, number]> = [
    // wrist(mm), snug, comfort, loose
    [140, 125.5, 132.6, 139.7],
    [150, 135.7, 142.8, 149.9],
    [160, 145.8, 152.9, 160.0],
    [170, 156.0, 163.0, 170.1],
    [180, 166.0, 173.1, 180.2],
    [190, 176.1, 183.2, 190.2],
    [200, 186.2, 193.2, 200.3],
    [210, 196.3, 203.3, 210.3],
  ];

  it.each(table)("wrist %imm → snug %f / comfort %f / loose %f", (wrist, snug, comfort, loose) => {
    const at = (fit: "snug" | "comfort" | "loose") =>
      computeSizing({
        product: "bracelet", thicknessMm: T, widthMm: 4, gapChordMm: 25.4,
        wristMm: wrist, fit,
      }).blankLengthMm;
    expect(at("snug")).toBeCloseTo(snug, 0);
    expect(at("comfort")).toBeCloseTo(comfort, 0);
    expect(at("loose")).toBeCloseTo(loose, 0);
  });

  it("ברירת המחדל 160 מ\"מ ≈ פרק יד 16.7 ס\"מ ב-comfort", () => {
    const derived = sizeFromBlank(FAB.products.bracelet.defaultLengthMm, {
      product: "bracelet", thicknessMm: T, widthMm: 4,
      gapChordMm: FAB.products.bracelet.defaultGapMm, fit: "comfort",
    });
    expect(derived.wristMm!).toBeCloseTo(167, 0);
  });

  it("כל טווח פרקי היד נכנס ל-lengthRangeMm", () => {
    const [lo, hi] = FAB.products.bracelet.lengthRangeMm;
    for (const wrist of [140, 175, 210]) {
      for (const fit of ["snug", "comfort", "loose"] as const) {
        const L = computeSizing({
          product: "bracelet", thicknessMm: T, widthMm: 4, gapChordMm: 25.4, wristMm: wrist, fit,
        }).blankLengthMm;
        expect(L).toBeGreaterThanOrEqual(lo);
        expect(L).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe("width comfort allowance", () => {
  it("מדורג לפי §2.5", () => {
    expect(FAB.widthComfortAllowanceMm(4)).toBe(0);
    expect(FAB.widthComfortAllowanceMm(5)).toBe(0.5);
    expect(FAB.widthComfortAllowanceMm(8)).toBe(1.25);
    expect(FAB.widthComfortAllowanceMm(12)).toBe(2.5);
  });

  it("פס רחב מאריך את הפריסה ומשאיר את המידה הנומינלית", () => {
    const narrow = computeSizing({
      product: "ring", thicknessMm: T, widthMm: 4, gapChordMm: 3, idMm: US_RING_ID_MM["7"],
    });
    const wide = computeSizing({
      product: "ring", thicknessMm: T, widthMm: 12, gapChordMm: 3, idMm: US_RING_ID_MM["7"],
    });
    expect(wide.blankLengthMm - narrow.blankLengthMm).toBeCloseTo(2.5, 2);
    expect(wide.nominalIdMm).toBe(narrow.nominalIdMm);
  });
});

describe("round trips", () => {
  it("computeSizing ↔ sizeFromBlank לטבעת", () => {
    for (const w of [4, 6, 8, 12]) {
      for (const gap of [2, 3, 5]) {
        const r = computeSizing({
          product: "ring", thicknessMm: T, widthMm: w, gapChordMm: gap, idMm: 17.35,
        });
        const back = sizeFromBlank(r.blankLengthMm, {
          product: "ring", thicknessMm: T, widthMm: w, gapChordMm: gap,
        });
        expect(back.nominalIdMm).toBeCloseTo(17.35, 6);
      }
    }
  });

  it("computeSizing ↔ sizeFromBlank לצמיד", () => {
    for (const fit of ["snug", "comfort", "loose"] as const) {
      const r = computeSizing({
        product: "bracelet", thicknessMm: T, widthMm: 15, gapChordMm: 25.4, wristMm: 168, fit,
      });
      const back = sizeFromBlank(r.blankLengthMm, {
        product: "bracelet", thicknessMm: T, widthMm: 15, gapChordMm: 25.4, fit,
      });
      expect(back.wristMm!).toBeCloseTo(168, 6);
    }
  });
});

describe("gap as chord, not arc", () => {
  it("קשת הפער ארוכה מהמיתר, והפער בין השניים גדל ככל שהקשת חדה יותר", () => {
    const cuff = computeSizing({
      product: "bracelet", thicknessMm: T, widthMm: 4, gapChordMm: 25.4, wristMm: 160, fit: "comfort",
    });
    expect(cuff.gapArcMm).toBeGreaterThan(25.4);
    expect(cuff.gapArcMm).toBeCloseTo(26.3, 1);

    // בטבעת הפער קטן ביחס לרדיוס, אז מיתר וקשת כמעט זהים
    const ring = computeSizing({
      product: "ring", thicknessMm: T, widthMm: 4, gapChordMm: 3, idMm: 17.35,
    });
    expect(ring.gapArcMm - 3).toBeLessThan(0.05);
  });
});

describe("neutralRadiusFromBlank", () => {
  it("סוגר את המעגל: היקף ניטרלי = פריסה + קשת הפער", () => {
    for (const [L, gap] of [[55.5, 3], [160, 25.4], [200, 30]] as const) {
      const r = neutralRadiusFromBlank(L, gap);
      const gapArc = 2 * r * Math.asin(gap / (2 * r));
      expect(2 * Math.PI * r).toBeCloseTo(L + gapArc, 6);
    }
  });

  it("עקבי עם computeSizing — הרדיוס הפנימי הוא R_n − K·t, לא R_n − t/2", () => {
    const r = computeSizing({
      product: "ring", thicknessMm: T, widthMm: 4, gapChordMm: 3, idMm: US_RING_ID_MM["7"],
    });
    const Rn = neutralRadiusFromBlank(r.blankLengthMm, 3);
    expect(2 * (Rn - r.kFactor * T)).toBeCloseTo(US_RING_ID_MM["7"], 6);
    // ההנחה הנאיבית t/2 מקטינה את ה-ID ב-t·(1−2K)
    expect(2 * (Rn - T / 2)).toBeCloseTo(US_RING_ID_MM["7"] - T * (1 - 2 * r.kFactor), 6);
  });
});

describe("nearestUsRingSize", () => {
  it("מעגל לחצי מידה ונשאר בטווח הטבלה", () => {
    expect(nearestUsRingSize(US_RING_ID_MM["7"])).toBe(7);
    expect(nearestUsRingSize(US_RING_ID_MM["10"])).toBe(10);
    expect(nearestUsRingSize(5)).toBe(4);
    expect(nearestUsRingSize(40)).toBe(13);
  });

  it("מידה אמריקאית אחת = 0.83 מ\"מ ID", () => {
    expect(MM_ID_PER_US_SIZE).toBeCloseTo(0.83, 2);
  });
});
