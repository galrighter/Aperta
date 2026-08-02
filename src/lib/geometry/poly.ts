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
