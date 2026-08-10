import { describe, expect, it } from "vitest";
import { FAB, NECK_FLOOR_MM } from "@/lib/fabrication.config";
import { thickenBridges } from "../thickenBridges";
import { frameCutoutsDims } from "../frameCutouts";
import { validateNormalized } from "../validate";
import { normalizeSvg } from "../normalize";
import { difference, rectPolygon, union } from "../poly";
import type { MultiPolygon } from "../types";

// **המתקן והשופט מודדים מול אותו מספר.**
//
// עד כאן היו שניים: `thickenBridges` ויתר על צוואר שרחב מ-0.70 (הסובלנות של
// AP-0075, שנועדה למנוע פס מתכת על אות בשביל מאיות מ"מ), ו-V4 הפילה כל צוואר
// שצר מ-0.75. התוצאה היא **תחום מת** — [0.70, 0.75) נפסל בוודאות ואי אפשר היה
// לתקן אותו, כי המתקן ויתר עליו במכוון והשופט פסל אותו במכוון.
//
// כך נראה עיצוב 99: הוא אומץ משיתוף באורך קצר יותר, `rescaleCutoutsSvg` הכפיל
// את הגשרים שישבו על 0.75 בדיוק בקנה מידה קטן מ-1, וחמישה מהם נחתו בתחום. הדוח
// אמר "לא ניתן לייצור" ושום יצירה חוזרת לא הייתה מוציאה אותו משם.
//
// מה שנבדק כאן הוא לא ערך אלא **תכונה של הצינור**: אחרי `thickenBridges`, כל
// צוואר עומד ב-V4. הבדיקה הזו נכשלת אם מישהו יזיז אחד מהשניים לבד.

const L = 40, W = 10;
const OPTS = { minBridgeMm: FAB.minLetterBridgeMm, maxAddedFraction: 0.02 };
const DIMS = { productType: "bracelet" as const, lengthMm: L, widthMm: W, thicknessMm: 1.5 };

function design(cutouts: MultiPolygon) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}"><g id="cutouts">` +
    cutouts
      .map((p) => `<path d="${p.map((r) => `M${r.map((q) => q.join(" ")).join("L")}Z`).join("")}" fill="black"/>`)
      .join("") +
    "</g></svg>";
  return normalizeSvg(svg, L, W);
}

/** אותה צורה כמו ב-`thickenBridges.test.ts`: חלל של אות שהגשר שלו צר מדי. */
function withNeck(neck: number) {
  const cut = [rectPolygon(10, 3, 20, 7)];
  const island = [rectPolygon(13, 4.5, 17, 5.5)];
  const bridge = [rectPolygon(15 - neck / 2, 3, 15 + neck / 2, 5)];
  return design(difference(cut, union(island, bridge)));
}

const v4Of = (n: Parameters<typeof validateNormalized>[0]) =>
  validateNormalized(n, DIMS).checks.find((c) => c.check === "V4")!;

/** הצינור כפי ש-`frameCutouts` מריץ אותו: מעבים, ואז שופטים. */
function framed(neck: number) {
  const before = withNeck(neck);
  const { design: after, records } = thickenBridges(before, OPTS);
  return { thickened: records.length, v4: v4Of(after).status };
}

describe("רצפת הצוואר — מספר אחד לשני הצדדים", () => {
  it("הרצפה הנאכפת נגזרת מהרצפה ומהסובלנות, ולא נכתבת פעמיים", () => {
    expect(NECK_FLOOR_MM).toBe(FAB.minLetterBridgeMm - FAB.letterBridgeToleranceMm);
    // ולא 0.7000000000000001, שזה גם מה שהיה נכתב בהודעה ללקוחה.
    expect(String(NECK_FLOOR_MM)).toBe("0.7");
  });

  // הליבה. 0.71–0.749 הוא התחום המת שהיה: המתקן מוותר (0 רשומות) והשופט חייב
  // לקבל. 0.3–0.68 הוא מה שהמתקן כן מרחיב, ואחריו השופט חייב לקבל גם כן.
  for (const neck of [0.3, 0.5, 0.68, 0.71, 0.72, 0.74, 0.749, 0.8]) {
    it(`צוואר של ${neck} מ"מ עובר ולידציה אחרי עיבוי`, () => {
      expect(framed(neck).v4).toBe("pass");
    });
  }

  it("בתחום המת המתקן אכן לא נוגע — ולכן זה השופט שהשתנה, לא התיקון", () => {
    // חשוב שזה יישאר כך: התיקון הוא `linkRect` ברוחב מלא, והוא היה מורח פס
    // מתכת על האות בשביל שלוש מאיות מ"מ שה-kerf (0.12) בולע ממילא.
    expect(framed(0.72).thickened).toBe(0);
    expect(framed(0.68).thickened).toBe(1);
  });

  it("צוואר שבאמת צר עדיין נפסל — הסובלנות לא ביטלה את הבדיקה", () => {
    // בלי עיבוי: זה מה ש-V4 רואה כשהתיקון ויתר מסיבה אחרת (תקציב קודקודים,
    // יותר מדי איים, או שהתיקון היה גדול מדי).
    const v4 = v4Of(withNeck(0.3));
    expect(v4.status).toBe("fail");
    expect(v4.locations.length).toBeGreaterThan(0);
    expect(v4.details).toContain("0.7mm");
  });

  it("הגבול עבר לרצפה הנאכפת: 0.69 נפסל, 0.71 עובר", () => {
    expect(v4Of(withNeck(0.69)).status).toBe("fail");
    expect(v4Of(withNeck(0.71)).status).toBe("pass");
  });
});

// המקרה שדווח, מקצה לקצה: עיצוב 99 הוא אימוץ של שיתוף באורך קצר יותר.
describe("אימוץ באורך קצר יותר — המסלול שהפיל את עיצוב 99", () => {
  /** גשר שיושב **בדיוק** על הרצפה — זה מה ש-`thickenBridges` משאיר אחריו. */
  const atFloor = () => withNeck(FAB.minLetterBridgeMm);

  it("גשר על הרצפה שנמתח לאורך קצר ב-6% עובר מסגור מלא", () => {
    // 0.75 × 0.94 = 0.705. עד כאן: מתחת ל-0.75 ולכן V4 הפילה, ומעל 0.70 ולכן
    // העיבוי ויתר — חמישה כאלה, "לא ניתן לייצור", ובלי שום דרך לצאת מזה.
    const { report } = frameCutoutsDims(
      { ...DIMS, lengthMm: L * 0.94 },
      atFloor().canonicalSvg,
    );
    expect(report.checks.find((c) => c.check === "V4")!.status).toBe("pass");
    expect(report.status).not.toBe("fail");
  });

  it("ומתיחה שיורדת מתחת לרצפה הנאכפת עדיין מתוקנת, לא נפסלת", () => {
    // 0.75 × 0.85 = 0.6375, מתחת ל-0.70: כאן העיבוי הוא שעובד, ומחזיר לרצפה.
    const framedOut = frameCutoutsDims(
      { ...DIMS, lengthMm: L * 0.85 },
      atFloor().canonicalSvg,
    );
    expect(framedOut.bridges.filter((b) => b.kind === "thickened")).toHaveLength(1);
    expect(framedOut.report.checks.find((c) => c.check === "V4")!.status).toBe("pass");
  });
});
