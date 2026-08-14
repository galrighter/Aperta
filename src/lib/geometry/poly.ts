import polygonClipping from "polygon-clipping";
import * as ClipperLib from "clipper-lib";
import type { MultiPolygon, Polygon, Ring, Pt } from "./types";

// polygon-clipping לבוליאניות (לפי הספק), clipper-lib ל-erosion/dilation.

const CLIPPER_SCALE = 1000; // 1 יחידת clipper = 0.001 מ"מ

export function union(...polys: MultiPolygon[]): MultiPolygon {
  const nonEmpty = polys.filter((p) => p.length > 0);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return polygonClipping.union(nonEmpty[0]) as MultiPolygon;
  return polygonClipping.union(
    nonEmpty[0],
    ...nonEmpty.slice(1),
  ) as MultiPolygon;
}

export function difference(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0) return [];
  if (b.length === 0) return a;
  return polygonClipping.difference(a, b) as MultiPolygon;
}

export function intersection(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  return polygonClipping.intersection(a, b) as MultiPolygon;
}

/**
 * בוליאניות על **רשת clipper** — לשימוש כששני האופרנדים אמורים לחלוק מתאר.
 *
 * למה זה קיים בכלל, כשיש כבר `union`/`difference`/`intersection`: polygon-clipping
 * עובד בנקודה צפה, ונקודת החולשה שלו היא שני מתארים שכמעט-חופפים לאורך —
 * "כמעט" ברמת הסיביות האחרונות. ה-sweep-line מייצר אז שרשרת מקטעים שאינה
 * נסגרת לטבעת, והוא זורק `Unable to complete output ring starting at [...]`
 * כשההפרש בין הנקודה שהוא חיפש לזו שמצא הוא 1e-15 — כלומר אותה נקודה.
 *
 * מאיפה מגיע "כמעט": כל מה ש-`offset` מחזיר עבר דרך `toClipper`, כלומר יושב
 * על רשת של 0.001 מ"מ, ואילו הפוליגון המקורי הוא צף גולמי מדגימת הקשתות.
 * פעולה בוליאנית בין השניים מציבה זה מול זה שני עותקים של אותו מתאר שנבדלים
 * בשארית העיגול — בדיוק הקלט שמפיל אותו.
 *
 * כאן שני האופרנדים עוברים את **אותו** `toClipper`, ולכן המתאר המשותף הופך
 * לאותו פוליגון שלמים בדיוק. clipper הוא שלם-מדויק ואיטרטיבי, ולכן הוא גם
 * לא נופל על הרקורסיה של `isExteriorRing` בגיאומטריה עם קינון עמוק.
 *
 * **even-odd ולא nonzero:** `toClipper` משטח את הטבעות ומאבד מי חיצונית ומי
 * חור, ולכן כיוון הליפוף הוא שהיה צריך לשחזר את זה. even-odd עונה על השאלה
 * לפי הכלה בלבד — נכון לכל אופרנד שטבעותיו אינן חופפות זו את זו (פוליגון
 * "חיצונית + חורים" ופלט clipper כאחד), ובלי להישען על מוסכמת ליפוף של מי
 * שייצר אותו.
 *
 * זה **לא** מחליף את polygon-clipping כמנוע הבוליאני (ראה ההערה בראש הקובץ),
 * וגם לא רץ ראשון — ראה `differenceSafe`.
 */
function onGrid(clipType: ClipperLib.ClipType, a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  const c = new ClipperLib.Clipper();
  c.AddPaths(toClipper(a), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(toClipper(b), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(clipType, tree, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
  return fromPolyTree(tree, []);
}

/**
 * למה `onGrid` הוא נפילה-לאחור ולא המסלול הראשי.
 *
 * שתי הדרכים מחשבות את אותה פעולה, אבל לא לאותה רזולוציה: polygon-clipping
 * עובד בצף, clipper מעגל ל-0.001 מ"מ. ההפרש זעיר לכשעצמו — אלא שהתוצאה
 * נכנסת ישר לשני שערים עם סף חד, `drawnArea` ב-`uncuttableParts` ו-V4/V5
 * אחריו, ושם הפרש זעיר על חתיכה שיושבת בדיוק על הסף הופך תשובה.
 *
 * נמדד: הרצה שבה **כל** הפעולות עברו לרשת שינתה את השטח החתוך ב-201 מתוך
 * 1448 עיצובים שעברו גם קודם, ובשניים מהם הפכה דוח `pass` ל-`fail`. עיצוב
 * שהיה מיוצר נדחה — מחיר גבוה מדי בשביל תקלה שנוגעת ב-22% מהמקרים בלבד.
 *
 * לכן: polygon-clipping קודם, בדיוק כמו עד היום, ורק כשהוא **מודיע שנכשל**
 * (טבעת שלא נסגרה, או הרקורסיה של `isExteriorRing` שגלשה) אותו חישוב חוזר
 * על הרשת. עיצוב שעובד היום מקבל את אותה תשובה עד הביט האחרון; עיצוב שעד
 * עכשיו חזר כ-422 מקבל תשובה במקום כלום.
 */
function safely(
  op: (a: MultiPolygon, b: MultiPolygon) => MultiPolygon,
  clipType: ClipperLib.ClipType,
  a: MultiPolygon,
  b: MultiPolygon,
): MultiPolygon {
  try {
    return op(a, b);
  } catch (e) {
    // לא בשקט: זה עדיין מסלול חריג, ומי שקורא לוגים צריך לדעת שהעיצוב הזה
    // נגע בו. הכשל עצמו כבר לא מגיע ללקוחה.
    console.warn(`boolean op fell back to the clipper grid — ${e instanceof Error ? e.message : e}`);
    return onGrid(clipType, a, b);
  }
}

/** `intersection` שלא נכשל על מתאר משותף. ראה `safely`. */
export function intersectionSafe(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  return safely(intersection, ClipperLib.ClipType.ctIntersection, a, b);
}

/** `difference` שלא נכשל על מתאר משותף. ראה `safely`. */
export function differenceSafe(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0) return [];
  if (b.length === 0) return a;
  return safely(difference, ClipperLib.ClipType.ctDifference, a, b);
}

export function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** שטח פוליגון (חיצוני פחות חורים), תמיד חיובי */
export function polygonArea(poly: Polygon): number {
  if (poly.length === 0) return 0;
  let a = Math.abs(ringArea(poly[0]));
  for (let i = 1; i < poly.length; i++) a -= Math.abs(ringArea(poly[i]));
  return Math.max(0, a);
}

export function multiPolygonArea(mp: MultiPolygon): number {
  return mp.reduce((s, p) => s + polygonArea(p), 0);
}

export function ringCentroid(ring: Ring): Pt {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    // מנוון — ממוצע נקודות
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function ringBBoxRadius(ring: Ring): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY) / 2 + 0.5;
}

function toClipper(mp: MultiPolygon): ClipperLib.Paths {
  const paths: ClipperLib.Paths = [];
  for (const poly of mp) {
    for (const ring of poly) {
      paths.push(ring.map(([x, y]) => ({ X: Math.round(x * CLIPPER_SCALE), Y: Math.round(y * CLIPPER_SCALE) })));
    }
  }
  return paths;
}

const toRing = (path: ClipperLib.Path): Ring =>
  path.map(({ X, Y }) => [X / CLIPPER_SCALE, Y / CLIPPER_SCALE] as Pt);

/**
 * שחזור MultiPolygon מעץ הקינון של clipper.
 *
 * למה עץ ולא רשימת טבעות שטוחה: הרשימה השטוחה מאבדת קינון של יותר משתי רמות.
 * הבנייה הקודמת הייתה `difference(איחוד החיצוניים, איחוד החורים)`, וזה מוחק
 * **אי בתוך חור** — האי הוא חיצוני שיושב בתוך חור, וההפרש בולע אותו. בדיוק
 * המקרה שחשוב כאן: הקונטור של אות הוא אי בתוך החיתוך של האות. נמדד: פס עם
 * חלל של אות איבד את הקונטור בכל erosion, ולכן הפתיחה החזירה גוף אחד במקום
 * שניים ושום גשר לא זוהה.
 *
 * בעץ, כל צומת שאינו חור הוא פוליגון; ילדיו הישירים הם חוריו; והנכדים הם
 * פוליגונים בפני עצמם.
 */
function fromPolyTree(node: ClipperLib.PolyNode, out: MultiPolygon): MultiPolygon {
  for (const child of node.Childs()) {
    if (child.IsHole()) {
      // חור מטופל ע"י ההורה; כאן רק ממשיכים אל האיים שבתוכו.
      fromPolyTree(child, out);
      continue;
    }
    const contour = child.Contour();
    if (contour.length >= 3) {
      const poly: Polygon = [toRing(contour)];
      for (const hole of child.Childs()) {
        if (hole.IsHole() && hole.Contour().length >= 3) poly.push(toRing(hole.Contour()));
      }
      out.push(poly);
    }
    fromPolyTree(child, out);
  }
  return out;
}

/**
 * היסט (offset) של MultiPolygon: delta שלילי = erosion, חיובי = dilation.
 * פינות עגולות כדי לדמות דיסק מורפולוגי.
 */
export function offset(mp: MultiPolygon, deltaMm: number): MultiPolygon {
  if (mp.length === 0) return [];
  const co = new ClipperLib.ClipperOffset(2, 0.05 * CLIPPER_SCALE);
  co.AddPaths(toClipper(mp), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, deltaMm * CLIPPER_SCALE);
  return fromPolyTree(tree, []);
}

/**
 * מוריד נקודות שקרובות מדי זו לזו. מתאר שחוזר מהמעקב נושא נקודה כל שברי מ"מ,
 * וזה מה שמייקר כל פעולת היסט עליו. המתאר זז בפחות מ-`distanceMm`.
 */
export function simplify(mp: MultiPolygon, distanceMm: number): MultiPolygon {
  // טבעת־טבעת, ולא דרך רשימה שטוחה: הניקוי לא משנה טופולוגיה, ולכן אין מה
  // לשחזר — ושחזור הוא בדיוק מה שמאבד אי שיושב בתוך חור.
  const out: MultiPolygon = [];
  for (const poly of mp) {
    const rings: Ring[] = [];
    for (const ring of poly) {
      const [cleaned] = ClipperLib.Clipper.CleanPolygons(
        [ring.map(([x, y]) => ({ X: Math.round(x * CLIPPER_SCALE), Y: Math.round(y * CLIPPER_SCALE) }))],
        distanceMm * CLIPPER_SCALE,
      );
      if (!cleaned || cleaned.length < 3) {
        // טבעת שהתרוקנה: אם זו החיצונית הפוליגון נעלם, אם זה חור הוא נסגר.
        if (rings.length === 0) break;
        continue;
      }
      rings.push(cleaned.map(({ X, Y }) => [X / CLIPPER_SCALE, Y / CLIPPER_SCALE] as Pt));
    }
    if (rings.length) out.push(rings);
  }
  return out;
}

/** פתיחה מורפולוגית: erosion ואז dilation באותו רדיוס. אזורים צרים מ-2r נעלמים. */
export function morphologicalOpen(mp: MultiPolygon, radiusMm: number): MultiPolygon {
  const eroded = offset(mp, -radiusMm);
  if (eroded.length === 0) return [];
  return offset(eroded, radiusMm);
}

export function rectPolygon(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
}
