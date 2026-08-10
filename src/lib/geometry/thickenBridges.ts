import { FAB } from "@/lib/fabrication.config";
import { difference, intersection, morphologicalOpen, multiPolygonArea, polygonArea, rectPolygon, simplify } from "./poly";
import { polygonToPathD, type NormalizedDesign } from "./normalize";
import { linkRect, rebuildDesign, shortestLink, type BridgeRecord } from "./restoreBridges";
import type { MultiPolygon, Polygon, Pt } from "./types";

// גשר שהמודל צייר בעצמו ויצא דק מהמינימום — מרחיבים אותו למינימום.
//
// `restoreBridges` מטפל באי ש**נותק**. זה מטפל באי שמחובר, אבל בחוט. נמדד על
// AP-0068: הגשר שהחזרנו הוא 0.75 מ"מ (הרצפה), והגשרים שהמודל צייר לאותיות
// השכנות הם 0.37–0.83. כלומר הגשר שלנו נראה כבד יותר מהאחרים — לא כי הוא עבה
// מדי, אלא כי הוא היחיד שעומד בכלל. וצוואר של 0.37 מ"מ הוא לא "עדין": הוא
// מתחת ל-minLetterBridgeMm ומתחת ל-minBridgeCut, כלומר זה מה שיישבר בחיתוך.
//
// **איך מזהים גשר, ובלי לגעת בכל קו דק.** הניסיון הראשון היה "תחתוך פה — האם
// נופל חלק סגור?", והוא נכשל על טריז שמתחדד לקצה (הזווית של M, עוקץ של serif):
// חיתוך בכל מקום לאורכו קוטע את הקצה, והקצה סגור. זה אי שהבדיקה יוצרת, לא אי
// שהיא מוצאת — ובפועל זה סימן את כל הקווים הפנימיים של ה-M.
//
// מה שעובד הוא לא לחקור בכלל, אלא **פתיחה מורפולוגית** בדיסק ברוחב הרצפה: כל
// מה שלא מסוגל להכיל את הדיסק נעלם. טריז שמתחדד נעלם — קצהו נמחק ובסיסו נשאר
// חלק מהגוף שממנו הוא יוצא — וקונטור אמיתי שורד כגוף בפני עצמו. מכיוון שהחומר
// כולו מחובר (`restoreBridges` רץ לפני), כל גוף שאינו הראשי מחובר לשאר דרך
// מתכת דקה מהרצפה. זה הגשר, וזו כל הבדיקה.
//
// על AP-0068 זה מוצא שניים — הקונטור של R (0.71) וזה של ה-e השנייה (0.41) —
// ולא נוגע בשום קו של ה-M. פחות מ-0.2 מ"מ² מתכת.
//
// **גשר אחד לאי.** אי שמוחזק בשני צווארים מקבל הרחבה אחת: הדרישה היא שהאי
// יחזיק, וזו כמות המתכת המינימלית שמשיגה אותה.

export interface ThickenOptions {
  /** הרצפה. גשר צר ממנה מורחב אליה. */
  minBridgeMm: number;
  /** מעל כמות המתכת הזו (כשבר מהחומר) לא נוגעים בכלום — סימן שהזיהוי טעה. */
  maxAddedFraction: number;
}

export interface ThickenResult {
  design: NormalizedDesign;
  records: BridgeRecord[];
}

/** גוף קטן מזה הוא רעש מעקב, לא אי. */
const DUST_MM2 = 0.005;

/** כמה מותר לניקוי להזיז את המתאר לפני הפתיחה. סדר גודל מתחת לרצפה. */
const CLEAN_MM = 0.02;

/** מעל זה משהו השתבש בזיהוי — עדיף לא לגעת מאשר לשנות עיצוב. */
const MAX_ISLANDS = 24;

/** כמה רחוק מהאי מחפשים את הצד השני. גשר ארוך מזה אינו גשר. */
const WINDOW_MM = 2;

/**
 * כמה מתחת לרצפה צוואר צריך להיות כדי שנגע בו. ראה הנימוק בלולאה.
 *
 * הפתיחה היא סף חד, והתיקון הוא פס ברוחב מלא — ולכן צוואר שחסרות לו מאיות
 * מילימטר מקבל את אותו טיפול כמו צוואר שחסר לו חצי. ה-kerf (0.12 מ"מ) גדול
 * מההפרש הזה, כלומר הוא לא קיים בחיתוך; הוא קיים רק על המסך, כפס על האות.
 *
 * **המספר מגיע מהתצורה ולא מכאן, כי V4 קוראת את אותו מספר.** כשהוא ישב כאן
 * לבדו הוא היה סובלנות של המתקן בלבד, והשופט המשיך להפיל על הרצפה המלאה —
 * כלומר כל צוואר בתחום שהמתקן מוותר עליו נפסל בלי דרך לתקן אותו. ראה
 * `letterBridgeToleranceMm`.
 */
const NECK_TOLERANCE_MM = FAB.letterBridgeToleranceMm;

/**
 * תקציב קודקודים לפתיחה, אחרי ניקוי. מעליו מוותרים — ראה למטה.
 *
 * 10,000 (החלטת גל). שני נימוקים, ושניהם לכיוון אחד: המשתמש ממתין ליצירה מעל
 * דקה ממילא, ולקוחה שנוטשת כי לא קיבלה תוצאה יקרה מכמה שניות המתנה.
 *
 * ומה שלא נסמכים עליו: 107 הגרסאות השמורות היום הן בדיקות, לא הזמנות. הכבדה
 * שבהן היא 5,391 קודקודים והחציון 639, אבל זה לא מדגם של מה שיגיע. התקרה היא
 * בלם מפני זנב לא חסום, ולכן היא יושבת מעל כל מה שנראה סביר ולא צמוד אליו.
 */
const MAX_VERTICES = 10000;

type BBox = [number, number, number, number];

const bboxOf = (poly: Polygon): BBox => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};

const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

const centroidOf = (poly: Polygon): [number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
};

/**
 * כמה רחב היה הצוואר לפני ההרחבה — חיפוש בינארי על **סביבת הצוואר בלבד**.
 *
 * זה המספר שהיומן צריך: לא "היה דק" אלא כמה. מודדים ישירות, כי שני הקיצורים
 * המתבקשים שקריים — החתיכה הדקה שנשארה מההפרש צרה מהצוואר (הגופים אכלו ממנה
 * משני הצדדים), והמרווח שנפער בין הגופים מתכנס לאפס כי ההרחבה בחזרה מקרבת
 * אותם. נמדד על AP-0068: השניים נתנו 0.22 ו-0.73 לאותו צוואר שהוא 0.37.
 *
 * החיתוך לסביבה הוא מה שהופך את זה לזול — פוליגון קטן במקום כל הפס.
 */
function neckWidthMm(material: MultiPolygon, at: Pt, maxMm: number): number | undefined {
  const pad = maxMm * 1.5;
  const local = intersection(material, [rectPolygon(at[0] - pad, at[1] - pad, at[0] + pad, at[1] + pad)]);
  if (local.length === 0) return undefined;
  // בסביבה עלולה להיכנס גם מתכת אחרת. הצוואר הוא החתיכה שהקישור עובר בה —
  // הקרובה ביותר לנקודה — וכל השאר רק היה מזייף את הספירה.
  let piece = local[0];
  if (local.length > 1) {
    let best = Infinity;
    for (const p of local) {
      const [cx, cy] = centroidOf(p);
      const d = Math.hypot(cx - at[0], cy - at[1]);
      if (d < best) { best = d; piece = p; }
    }
  }
  let lo = 0, hi = maxMm;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    if (morphologicalOpen([piece], mid / 2).length === 1) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 100) / 100;
}

/**
 * מרחיב לרצפה כל גשר שהמודל צייר צר ממנה.
 *
 * מחזיר את העיצוב כמו שהוא כשאין מה להרחיב, כדי ש-`frameCutouts` יזהה
 * "לא השתנה" ולא ירוץ שוב על ולידציה בלי סיבה.
 */
export function thickenBridges(n: NormalizedDesign, opts: ThickenOptions): ThickenResult {
  const radius = opts.minBridgeMm / 2;
  if (!(radius > 0)) return { design: n, records: [] };

  const strip: MultiPolygon = [rectPolygon(0, 0, n.lengthMm, n.widthMm)];
  const material = difference(strip, n.cutUnion);
  const materialArea = multiPolygonArea(material);
  // מתכת מנותקת היא לא העניין כאן — `restoreBridges` רץ לפני ומחבר או מוחק.
  // אם נשאר יותר מרכיב אחד הוא ויתר, וגם אנחנו.
  if (material.length !== 1 || materialArea <= 0) return { design: n, records: [] };

  // הגופים: מה ששורד את הדיסק ברוחב הרצפה.
  //
  // וזה כל הזיהוי. החומר מחובר (בדקנו), ולכן כל גוף שאינו הראשי מחובר לשאר
  // **דרך מתכת דקה מהרצפה** — כלומר דרך גשר שאינו עומד בכלל. טריז שמתחדד אינו
  // גוף בפני עצמו: הקצה שלו נעלם בפתיחה והבסיס נשאר חלק מהגוף שממנו הוא יוצא.
  // זו הבדיקה שהחליפה את "תחתוך פה — האם נופל חלק סגור", שסימנה כל קו פנימי
  // ב-M כגשר.
  //
  // הפתיחה רצה על גאומטריה **מנוקה**, לא על המקור: המתאר שחוזר מהמעקב נושא
  // נקודה כל 0.02–0.1 מ"מ, וזה מה שמייקר את שתי פעולות ההיסט. הניקוי מזיז את
  // המתאר בפחות מ-0.02 מ"מ — סדר גודל מתחת לרצפה שנמדדת — ומוריד את המסגור
  // מ-240 ל-140 מ"ש על AP-0068. המלבן עצמו נגרע בסוף מה-cutUnion המקורי, ולכן
  // הניקוי לא נכנס לגאומטריה שנשמרת.
  //
  // וגם עם הניקוי, המחיר גדל עם מספר הקודקודים מהר יותר מלינארית: 3,400
  // קודקודים הם 236 מ"ש, 7,200 הם 712. עיצוב אמיתי נמדד ב-720 (AP-0068) וב-787
  // (AP-0069), כלומר פי ארבעה מתחת לתקרה כאן. מעליה מוותרים ומודיעים: עדיף
  // עיצוב שלא עבר עיבוי ושכתוב עליו בלוג, מאשר מסגור שנתקע על כל מועמד.
  const simplified = simplify(material, CLEAN_MM);
  const vertices = simplified.reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0);
  if (vertices > MAX_VERTICES) {
    console.warn(`thickenBridges skipped: ${vertices} vertices over the ${MAX_VERTICES} budget`);
    return { design: n, records: [] };
  }

  const bodies = morphologicalOpen(simplified, radius);
  if (bodies.length < 2 || bodies.length > MAX_ISLANDS + 1) return { design: n, records: [] };

  let mainIdx = 0;
  const areas = bodies.map(polygonArea);
  for (let i = 1; i < areas.length; i++) if (areas[i] > areas[mainIdx]) mainIdx = i;

  const records: BridgeRecord[] = [];
  const rects: MultiPolygon = [];
  let addedArea = 0;
  const boxes = bodies.map(bboxOf);
  for (let i = 0; i < bodies.length; i++) {
    if (i === mainIdx || areas[i] < DUST_MM2) continue;
    // `shortestLink` הוא כל קודקוד מול כל צלע. הגוף הראשי הוא כל שאר הפריט,
    // ולהריץ אותו במלואו מול אי בגודל מילימטר הוא מכפלה של אלפי נקודות באלפי
    // צלעות — נמדד: מסגור של עיצוב עם 10,000 קודקודים קפץ מ-186 ל-1281 מ"ש.
    // הגשר ממילא קצר, ולכן החיפוש נחתך לחלון סביב האי.
    const [bx0, by0, bx1, by1] = boxes[i];
    const win: MultiPolygon = [rectPolygon(bx0 - WINDOW_MM, by0 - WINDOW_MM, bx1 + WINDOW_MM, by1 + WINDOW_MM)];
    let link: ReturnType<typeof shortestLink> | null = null;
    for (let j = 0; j < bodies.length; j++) {
      if (j === i || areas[j] < DUST_MM2) continue;
      if (!overlaps(boxes[j], [bx0 - WINDOW_MM, by0 - WINDOW_MM, bx1 + WINDOW_MM, by1 + WINDOW_MM])) continue;
      for (const near of intersection([bodies[j]], win)) {
        const alt = shortestLink(bodies[i], near);
        if (!link || alt.distMm < link.distMm) link = alt;
      }
    }
    // אי שאין לו שכן בחלון הוא לא אי שתלוי בגשר דק אלא משהו אחר; מדלגים.
    if (!link) continue;

    // **כמה דק הצוואר באמת** — נמדד לפני שמחליטים, ולא רק כדי לדווח.
    //
    // הפתיחה היא בדיקת סף חדה: צוואר של 0.74 מ"מ אינו מכיל דיסק של 0.75, ולכן
    // הוא מפריד גופים בדיוק כמו צוואר של 0.36. אבל התיקון אינו "להוסיף את
    // ההפרש": `linkRect` מותח מלבן ברוחב מלא בין שני הגופים **הפתוחים**, וכל
    // אחד מהם נשחק ברדיוס הדיסק — כלומר על צוואר שכבר עומד כמעט בדיוק בכלל
    // נמרח פס מתכת שלם. זה מה שראו על ה-G ב-AP-0075: חמישה מתוך שישה עיבויים
    // באותה הרצה נמדדו 0.74 מול רצפה של 0.75, וכל אחד מהם צייר פס על אות.
    //
    // 0.05 מ"מ הוא הסף (החלטת גל, 2.8): ה-kerf הוא 0.12 מ"מ, סדר גודל מעל
    // ההפרש שנרדף כאן, והמתאר שחוזר מהמעקב נושא נקודה כל 0.02–0.1 מ"מ. מתחת
    // לסף הזה ההבדל אינו קיים בחיתוך — הוא קיים רק בעין, כפס על האות.
    //
    // **והוויתור כאן הוא ויתור אמיתי, לא דחייה.** V4 מפילה מול `NECK_FLOOR_MM`,
    // שהוא בדיוק הסף הזה, ולכן מה שנשאר כאן עובר גם שם. כשהשניים היו שני
    // מספרים, הצוואר שדילגנו עליו הוא זה שנפסל — ראה `letterBridgeToleranceMm`.
    const midpoint: Pt = [(link.a[0] + link.b[0]) / 2, (link.a[1] + link.b[1]) / 2];
    const neck = neckWidthMm(material, midpoint, opts.minBridgeMm);
    if (neck !== undefined && neck >= opts.minBridgeMm - NECK_TOLERANCE_MM) continue;

    const rect = linkRect(link.a, link.b, opts.minBridgeMm);
    rects.push(rect);
    // רוב המלבן יושב על מתכת קיימת. מה שנוסף בפועל הוא רק החלק שנופל על חיתוך,
    // וזה גם מה שנצבע ביומן: מלבן שלם היה נראה כמו גוש שהודבק על האות.
    const added = intersection([rect], n.cutUnion);
    addedArea += multiPolygonArea(added);
    const [x, y] = centroidOf(bodies[i]);
    const box = islandBox(bodies[i]);
    records.push({
      kind: "thickened",
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      widthMm: box[0],
      heightMm: box[1],
      fromMm: neck,
      bridgeMm: opts.minBridgeMm,
      pathD: added.map((p) => polygonToPathD(p)).join(""),
    });
  }
  if (records.length === 0) return { design: n, records: [] };

  if (addedArea / materialArea > opts.maxAddedFraction) return { design: n, records: [] };

  return { design: rebuildDesign(n, difference(n.cutUnion, rects)), records };
}

function islandBox(poly: Polygon): [number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [Math.round((x1 - x0) * 100) / 100, Math.round((y1 - y0) * 100) / 100];
}
