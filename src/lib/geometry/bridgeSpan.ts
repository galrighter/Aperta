import { intersection, rectPolygon } from "./poly";
import type { MultiPolygon, Polygon } from "./types";

// **עד לאן גשר חייב להגיע** — המדידה האחת שגם החיתוך וגם השחזור נשענים עליה.
//
// גשר של אות מחזיק אי מתכת (החלל הסגור של `8`, `ם`, `4`) אל גוף הפריט. שתי
// נקודות הקצה שלו הן לא עניין של סגנון אלא של עובדה: הוא חייב להיכנס **לתוך**
// האי, ולהגיע **אל** המתכת שמסביב. עד כאן שתיהן נוחשו מתיבות חוסמות, ושתיהן
// טעו — בדרכים שונות, ובאותה הרצה (AP-0097, 10.8.26):
//
//  · **תיבת האות.** `8` בפנים רבות אינה מסלול אחד אלא שתי טבעות שחופפות
//    באמצע, ולכן "התיבה שמכילה את החלל" היא הטבעת הפנימית ולא האות. הקצה
//    החיצון של הגשר נחת בתוך הדיו, בין שני החללים — כלומר הוא **ריתך את שני
//    האיים זה לזה** והשאיר את שניהם מנותקים מהגוף. שני הפגמים שהמשתמש דיווח
//    עליהם, מאותו שורש אחד.
//
//  · **תיבת החלל.** החלל של `4` הוא משולש. הקצה הפנימי נמדד מקצה התיבה
//    החוסמת אותו, אבל במרכז הרוחב — שם הגשר יושב — גבול האי נמצא מילימטר
//    נמוך יותר. הרצועה נעצרה בדיו ולא נגעה באי בכלל.
//
// כאן שתי הנקודות **נמדדות**: הרצועה מוטלת על הגאומטריה עצמה, ומדווחים היכן
// האי מתחיל והיכן המתכת חוזרת. הצד שנבחר הוא זה שהפער בו קצר יותר — מה
// שהקוד הקודם ניסה להשיג מהתיבות, ועכשיו יוצא מהמדידה.
//
// מה שנשאר החלטה ולא מדידה — **הציר** (מהצד בעברית, מלמעלה בלטינית) ומרכז
// הרצועה — נקבע אצל הקורא: זו זהות האות, לא גאומטריה עיוורת. ראה
// `textToStencil`.

/**
 * כמה הגשר נכנס **לתוך** האי. די בנגיעה כדי לחבר, וכל מ"מ נוסף הוא מתכת
 * שאוכלת את החלל של האות. חצי רוחב הוא מרווח בטחון מול רעש המעקב.
 */
export const BRIDGE_DEPTH_RATIO = 0.5;

/**
 * כמה הגשר חורג אל **תוך** המתכת שמעבר, כדי להבטיח חפיפה.
 *
 * היה רוחב הגשר עצמו, כ-0.75 מ"מ. זה מיותר (החפיפה נקבעת מהמגע, לא מהאורך)
 * ובעברית זה מזיק ממש: המרווח בין אותיות קטן מזה, והגשר של ם׳ נוגע באות
 * השכנה. חפיפה של עשירית מילימטר מספיקה לניתוח הפוליגונים ואינה נראית.
 */
export const BRIDGE_OVERSHOOT_MM = 0.1;

/** הרצועה שהגשר יושב בה — הציר שהוא חוצה, ואיפה הוא יושב לאורכו. */
export interface BridgeBand {
  /** אופקי (עברית) או אנכי (לטינית) — הציר שהגשר **חוצה**. */
  sideways: boolean;
  /** מרכז הרצועה בציר הניצב לחצייה. */
  centre: number;
  /** רוחב הרצועה. */
  width: number;
}

const bboxOf = (mp: MultiPolygon): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of mp) {
    for (const [x, y] of poly[0]) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
};

/** טווח הפוליגונים לאורך הציר שהגשר חוצה. */
function extent(mp: MultiPolygon, sideways: boolean): [number, number] {
  const [x0, y0, x1, y1] = bboxOf(mp);
  return sideways ? [x0, x1] : [y0, y1];
}

/**
 * הגשר שמחבר את `island` אל `main`, כמלבן — או `null` כשאין מה לחבר.
 *
 * `null` פירושו שהרצועה אינה חותכת את האי, או שאין מתכת משני צדיו בתוך
 * הגאומטריה שנמסרה. הקורא מחליט מה לעשות עם זה; כאן לא ממציאים גשר.
 */
export function bridgeRect(
  island: Polygon,
  main: MultiPolygon,
  band: BridgeBand,
): Polygon | null {
  if (main.length === 0) return null;
  const { sideways, centre, width } = band;
  const [bx0, by0, bx1, by1] = bboxOf([...main, island]);
  // הרצועה נמתחת על כל הגאומטריה לאורך הציר — היא נועדה למצוא את המתכת
  // שמעבר לדיו, ולכן אסור לה להיעצר בתיבה של האות.
  const probe: MultiPolygon = [
    sideways
      ? rectPolygon(bx0 - 1, centre - width / 2, bx1 + 1, centre + width / 2)
      : rectPolygon(centre - width / 2, by0 - 1, centre + width / 2, by1 + 1),
  ];

  const onIsland = intersection([island], probe);
  if (onIsland.length === 0) return null;
  const [i0, i1] = extent(onIsland, sideways);

  // הרכיב הקרוב ביותר של הגוף מכל צד. רכיב שנשען על האי עצמו אינו "מעבר לו"
  // ולכן אינו נספר — הפער נמדד עד מתכת שהגשר באמת צריך לחצות אליה.
  let before = -Infinity;
  let after = Infinity;
  for (const poly of intersection(main, probe)) {
    const [lo, hi] = extent([poly], sideways);
    if (hi <= i0 && hi > before) before = hi;
    if (lo >= i1 && lo < after) after = lo;
  }
  const gapBefore = i0 - before;
  const gapAfter = after - i1;
  if (!Number.isFinite(gapBefore) && !Number.isFinite(gapAfter)) return null;

  // הצד הקצר. גשר קצר חוצה גזע דק אחד; ארוך חוצה את האות לרוחבה.
  const depth = Math.min(width * BRIDGE_DEPTH_RATIO, (i1 - i0) / 2);
  const [a, b] = gapBefore <= gapAfter
    ? [before - BRIDGE_OVERSHOOT_MM, i0 + depth]
    : [i1 - depth, after + BRIDGE_OVERSHOOT_MM];

  return sideways
    ? rectPolygon(a, centre - width / 2, b, centre + width / 2)
    : rectPolygon(centre - width / 2, a, centre + width / 2, b);
}
