import { describe, it, expect } from "vitest";
import { normalizeSvg, dropThinCutouts } from "../normalize";
import { validateNormalized } from "../validate";
import { frameCutoutsDims } from "../frameCutouts";
import { difference, differenceSafe, intersection, intersectionSafe, rectPolygon } from "../poly";

// הכלל שמנקה גרסאות שנשמרו לפני שהווקטורייזר התחיל לסנן: מה שאי אפשר לחתוך
// מוסר במקום לפסול את הפס כולו — פתח שלם שקטן מדי (אותו סף בדיוק ש-V5 מריץ),
// וגם חלק דק מדי בתוך פתח שאחרת תקין. השני הוא AP-0165; ראה למטה.

const DIMS = { productType: "bracelet" as const, lengthMm: 160, widthMm: 15, thicknessMm: 1.5 };
const svg = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 15"><g id="cutouts">${inner}</g></svg>`;

/** עלה של 4x2 מ"מ, ולידו השערה שהטרייסר משאיר — 1.5x0.17 מ"מ, כמו במדידה אמיתית. */
const LEAF = `<rect x="20" y="6" width="4" height="2"/>`;
const HAIR = `<rect x="30" y="7" width="1.5" height="0.17"/>`;

describe("dropThinCutouts", () => {
  it("drops the hairline and keeps the opening beside it", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    expect(n.cutouts).toHaveLength(2);
    const cleaned = dropThinCutouts(n, 0.5);
    expect(cleaned.cutouts).toHaveLength(1);
    expect(cleaned.canonicalSvg).toContain(`<g id="cutouts">`);
  });

  it("turns a design V5 rejects into one it accepts", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    const before = validateNormalized(n, DIMS);
    expect(before.checks.find((c) => c.check === "V5")!.status).toBe("fail");

    const after = validateNormalized(dropThinCutouts(n, 0.5), DIMS);
    expect(after.checks.find((c) => c.check === "V5")!.status).toBe("pass");
  });

  it("returns the same object when there is nothing to drop", () => {
    // המסלול הנפוץ: לא בונים SVG מחדש ולא נוגעים ב-d המקורי לחינם.
    const n = normalizeSvg(svg(LEAF), 160, 15);
    expect(dropThinCutouts(n, 0.5)).toBe(n);
  });

  it("a zero minimum keeps everything", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    expect(dropThinCutouts(n, 0)).toBe(n);
  });

  /* AP-0165 (14.8): כל שערה באותה הרצה יצאה **מתוך** פתח אמיתי במקום לשכב
     לידו. כפוליגון אחד הוא רחב לגמרי, ולכן המנקה השאיר אותו שלם עם הזרוע,
     V5 ענה "All cutouts ≥ 0.5mm", ו-V4 הפיל את שלושת המועמדים על הצווארים
     שהזרוע צבטה. שלושה עיצובים נוצרו, אחד הגיע ללקוח. */

  /** אותו עלה, והפעם השערה יוצאת מהשפה הימנית שלו במקום לשכב במרחק. */
  const TENTACLE = `<rect x="23.5" y="6.9" width="12" height="0.2"/>`;

  it("cuts a tentacle off the opening it grows out of", () => {
    const n = normalizeSvg(svg(LEAF + TENTACLE), 160, 15);
    // פוליגון אחד — זו כל הנקודה. `isCuttableOpening` עונה עליו "כן".
    expect(n.cutouts.flat()).toHaveLength(1);

    const cleaned = dropThinCutouts(n, 0.5);
    const bbox = cleaned.cutouts.flat().flat()[0].reduce(
      (m, [x]) => Math.max(m, x), 0,
    );
    expect(bbox).toBeLessThan(25);
  });

  it("does not take the opening down with the tentacle", () => {
    const n = normalizeSvg(svg(LEAF + TENTACLE), 160, 15);
    const cleaned = dropThinCutouts(n, 0.5);
    expect(cleaned.cutouts.flat().length).toBeGreaterThan(0);
    const area = (d: typeof n) => validateNormalized(d, DIMS).metrics.cutAreaMm2;
    // 8 ממ"ר של עלה נשארים; 2.4 ממ"ר של זרוע יורדים.
    expect(area(cleaned)).toBeGreaterThan(7.5);
    expect(area(n) - area(cleaned)).toBeGreaterThan(2);
  });

  it("leaves a clean opening byte for byte — corners included", () => {
    // כיווץ-והרחבה מגלח גם פינה קמורה חדה. אילו זה היה נמחק, כל עיצוב בקטלוג
    // היה נכתב מחדש בכל מסגור; מוסר רק מה שגדול מספיק כדי שצויר.
    const n = normalizeSvg(svg(LEAF), 160, 15);
    expect(dropThinCutouts(n, 0.5).canonicalSvg).toBe(n.canonicalSvg);
  });

  it("barely loses any open area", () => {
    const n = normalizeSvg(svg(LEAF + HAIR), 160, 15);
    const cleaned = dropThinCutouts(n, 0.5);
    const area = (d: typeof n) => validateNormalized(d, DIMS).metrics.openAreaPct;
    expect(area(n) - area(cleaned)).toBeLessThan(0.02);
  });

  /* AP-0170 (14.8): קצה משונן של צללית מצוירת. הרקע שסביב הצללית הוא cutout
     שנוגע במסגרת, והמרווחים בין שיני הפרנז הם "חלקים דקים" שלו — המדידה
     חלק-אחר-חלק מילאה אותם במתכת וריתכה את הפרנז לעור מוצק על המתאר. אזור
     שנוגע במסגרת אינו חור, והלייזר פשוט עוקב אחרי קו המתאר. */

  /** רקע עליון של צללית שקצהָ משונן: פס צמוד למסגרת שממנו יורדות שיניים,
   *  והמרווחים ביניהן צרים מהמינימום (0.3 מ"מ). */
  const FRINGED_TOP =
    `<path d="M0 0 L160 0 L160 2 ` +
    Array.from({ length: 40 }, (_, i) => {
      const x = 150 - i * 3;
      return `L${x} 2 L${x} 3.2 L${x - 0.3} 3.2 L${x - 0.3} 2`;
    }).join(" ") +
    ` L0 2 Z"/>`;

  it("does not weld a fringed outer edge into the outline", () => {
    const n = normalizeSvg(svg(FRINGED_TOP + LEAF), 160, 15);
    // הרקע נוגע במסגרת → נשמר שלם, כולל המרווחים התת-מינימליים שבין השיניים.
    const cleaned = dropThinCutouts(n, 0.5);
    const area = (d: typeof n) => validateNormalized(d, DIMS).metrics.cutAreaMm2;
    expect(area(n) - area(cleaned)).toBeLessThan(0.01);
  });

  it("still cuts a tentacle from an enclosed opening in the same design", () => {
    const n = normalizeSvg(svg(FRINGED_TOP + LEAF + TENTACLE), 160, 15);
    const cleaned = dropThinCutouts(n, 0.5);
    const area = (d: typeof n) => validateNormalized(d, DIMS).metrics.cutAreaMm2;
    // רק הזרוע (2.4 ממ"ר) יורדת; הפרנז שעל המסגרת אינו נגרר איתה.
    expect(area(n) - area(cleaned)).toBeGreaterThan(2);
    expect(area(n) - area(cleaned)).toBeLessThan(2.6);
  });

  it("a border region that is wholly uncuttable still falls as a whole", () => {
    // כיס של 0.2 מ"מ צמוד למסגרת — הסמנטיקה הישנה של ה-predicate נשמרת.
    const sliver = `<rect x="50" y="0" width="8" height="0.2"/>`;
    const n = normalizeSvg(svg(sliver + LEAF), 160, 15);
    const cleaned = dropThinCutouts(n, 0.5);
    expect(cleaned.cutouts).toHaveLength(1);
  });
});

/* AP: ה-canary נכשל ב-14.8 גם אחרי התיקון של #235. הפרומפט הקבוע — "עיגולים
   חופפים בגדלים שונים לאורך הצמיד", צמיד 160×12 — חזר כדחייה נקייה במקום
   קריסה, אבל **נכשל לגמרי**:

       422 vectorize_failed — "Unable to complete output ring starting at
       [52.301, 11.73]. Last matching segment found ends at [52.425, 11.949]."

   #235 עטף את שתי נקודות הקריסה ולכן הפסיק להפיל בקשה שכבר הצליחה; הוא לא
   נגע בסיבה שבגללה המסגור נכשל מלכתחילה. זו כאן.

   השגיאה עצמה היא של polygon-clipping (`RingOut.factory` — שרשרת מקטעים שאינה
   נסגרת לטבעת), אבל **הקלט שמפיל אותו נבנה אצלנו**: `uncuttableParts` מעמיד
   את הפתח הגולמי — צף, מדגימת הקשתות — מול הפתיחה המורפולוגית שלו, שכולה
   `offset` ולכן כבר יושבת על רשת 0.001 מ"מ. שני עותקים של אותו מתאר שנבדלים
   בשארית העיגול, וההודעה מודה בזה: ההפרש בין הנקודה שחיפש לזו שמצא הוא 1e-15.
   בקינון עמוק אותו קלט מפיל את `isExteriorRing` הרקורסיבי במקום — וזה בדיוק
   ה-"Maximum call stack size exceeded" של #235, מאותו מקור.

   נמדד לפני התיקון על שני מאגרים סינתטיים. 612 עיצובי עיגולים חופפים: 135
   כשלים (104 "output ring", 31 "call stack"). 1800 עיצובים נוספים — עיגולים,
   אליפסות ומעורב, צמיד וטבעת, חמישה עוביים: 352 כשלים. **כל אחד מהם** בשתי
   השורות של `uncuttableParts`.

   אחרי התיקון: 612/612 ו-1800/1800 עוברים, ו-1448 העיצובים שעברו גם קודם
   החזירו תוצאה זהה עד הביט האחרון — אותו סטטוס, אותם V1–V5, אותו שטח חתוך,
   אותו משקל, אותו מספר גשרים, אותו SVG.

   הזהות הזו היא **למה הרשת היא נפילה-לאחור ולא המסלול הראשי**: גרסה שהעבירה
   את כל הפעולות לרשת תיקנה בדיוק אותם 352, אבל גם הזיזה את השטח החתוך ב-201
   עיצובים שעבדו קודם והפכה שני דוחות `pass` ל-`fail`. ראה `safely` ב-poly.ts. */
describe("עיגולים חופפים — הגיאומטריה שהפילה את ה-canary", () => {
  const CANARY = { productType: "bracelet" as const, lengthMm: 160, widthMm: 12, thicknessMm: 1 };

  /** אותו LCG בכל הרצה — שחזור דטרמיניסטי, לא הגרלה. */
  function circles(n: number, seed: number, rMin: number, rMax: number): string {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const els: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = (rMin + rnd() * (rMax - rMin)).toFixed(3);
      els.push(`<circle cx="${(rnd() * 160).toFixed(3)}" cy="${(rnd() * 12).toFixed(3)}" r="${r}"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 12"><g id="cutouts">${els.join("")}</g></svg>`;
  }

  // שלושה קלטים שנמדדו כנכשלים לפני התיקון — שניים על "output ring" ואחד על
  // הרקורסיה. הם נבדלים במספר העיגולים ובטווח הרדיוסים, כלומר בטופולוגיה של
  // החפיפה, ולא רק ב-seed.
  it.each([
    ["output ring, 10 עיגולים", 10, 2, 1, 3],
    ["output ring, 20 עיגולים", 20, 3, 2, 5],
    ["call stack, 80 עיגולים", 80, 3, 0.6, 6],
  ])("ממסגר את %s במקום לזרוק", (_label, n, seed, rMin, rMax) => {
    const framed = frameCutoutsDims(CANARY, circles(n, seed, rMin, rMax));
    // לא רק "לא זרק": הוולידציה באמת רצה והחזירה דוח מלא על גיאומטריה קיימת.
    expect(framed.report.checks.map((c) => c.check)).toEqual(["V1", "V2", "V3", "V4", "V5"]);
    expect(framed.normalized).not.toBeNull();
    expect(framed.report.metrics.cutAreaMm2).toBeGreaterThan(0);
  });

  // השער שמגן על התיקון: הנפילה לרשת שמורה למי שנכשל, ואסור לה לגעת בעיצוב
  // שאין בו מה לנקות. `dropThinCutouts` עדיין מחזיר את **אותו אובייקט** —
  // ולכן ה-d המקורי לא נכתב מחדש.
  it("לא נוגע בפתח נקי", () => {
    const n = normalizeSvg(svg(LEAF), 160, 15);
    expect(dropThinCutouts(n, 1.5)).toBe(n);
  });

  // והשער השני: כשה-polygon-clipping מצליח — כלומר בכל עיצוב שעובד היום —
  // העטיפה מחזירה בדיוק את מה שהוא החזיר, ולא את גרסת הרשת.
  it("מחזירה את תוצאת polygon-clipping כשהיא קיימת", () => {
    const box = [rectPolygon(0, 0, 10, 10)];
    const bite = [rectPolygon(4, 4, 12, 6)];
    expect(differenceSafe(box, bite)).toEqual(difference(box, bite));
    expect(intersectionSafe(box, bite)).toEqual(intersection(box, bite));
  });
});
