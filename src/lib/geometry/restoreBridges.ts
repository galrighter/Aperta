import { difference, polygonArea, rectPolygon } from "./poly";
import { polygonToPathD } from "./normalize";
import type { NormalizedDesign } from "./normalize";
import type { Box } from "@/lib/text/stencil";
import type { MultiPolygon, Polygon, Pt } from "./types";

// אי מתכת שחוזר מהמעקב — ומה עושים איתו.
//
// עד כאן הוא נמחק. `dropDetachedMaterial` שמר את רכיב המתכת הגדול ביותר וויתר
// על השאר, כי אי מנותק נופל בחיתוך והפריט לא ניתן לייצור. זה נכון, וזה גם מה
// שהרס את הכיתוב: החלל הסגור של `e` הוא אי כזה, והוא מנותק בדיוק כשהמודל צייר
// אותו ולא צייר את הגשר שהחזיק אותו. נמדד ב-RM-0068 — האי חזר, ואנחנו מחקנו
// אותו, והאות הפכה לכתם. ב-40 ההרצות שנבדקו, 12 הכילו אי שנמחק כך.
//
// הכלל כאן: **לגשר, ולמחוק רק כשאי אפשר.** ושני סוגי איים, כי לשניהם יש תשובה
// אחרת לשאלה "איפה הגשר אמור לשבת":
//
//  · **חלל של אות** — אנחנו חתכנו אותו, ולכן אנחנו יודעים. `textToStencil`
//    מחשב כל גשר ומחזיר אותו (`CutBridge`), והחלל שחוזר מזוהה מולו לפי מיקום
//    וגודל. הגשר מוחזר **בדיוק למקום שבו חתכנו אותו** — מלמעלה בלטינית,
//    מהצד בעברית — במקום לנחש כיוון מגאומטריה עיוורת. נמדד: אי שחזר ב-RM-0068
//    נפל 0.13–0.33 מ"מ מהחלל שחתכנו, על אות בגובה 5 מ"מ.
//
//  · **אי בעיטור** — אין לנו כוונה לשחזר, כי לא אנחנו ציירנו. מחברים לנקודה
//    הקרובה ביותר, וזה מותר רק כשהיא באמת קרובה: גשר ארוך שחוצה עיצוב מזיק
//    יותר מחלל חסר, ואת החלל אף אחד לא מחפש — הלקוחה לא ראתה מה המודל נתן,
//    ולכן שטח ריק נראה מתוכנן. מעל `maxSpanMm` מוחקים כמו קודם.

/** מה שהוחלט על אי אחד. נשמר ליומן — זו הדרך היחידה לבחון את הכלל לאורך זמן. */
export interface BridgeRecord {
  /** `letter` = הוחזר גשר שאנחנו חתכנו · `ornament` = חובר לנקודה הקרובה ·
   *  `dropped` = נמחק, כי אין נקודה קרובה מספיק ·
   *  `kept` = לא גושר ולא נמחק, כי הוא גדול מכדי להיות אי (ראה `maxDroppedFraction`) ·
   *  `thickened` = גשר שהמודל צייר בעצמו, דק מהמינימום, והורחב אליו. */
  kind: "letter" | "ornament" | "dropped" | "kept" | "thickened";
  /** מרכז האי, במ"מ. */
  x: number;
  y: number;
  /** גודל האי. */
  widthMm: number;
  heightMm: number;
  /** רוחב הגשר שנוצר. חסר במחיקה. */
  bridgeMm?: number;
  /** הרוחב שהיה **לפני** — רק בעיבוי, שם יש "לפני" למדוד. */
  fromMm?: number;
  /** אורך הגשר — המרחק שהוא גישר. חסר בחלל של אות (הגשר מוחזר, לא נמדד). */
  spanMm?: number;
  /** האות שהחלל שויך לה, וכמה רחוק הוא נפל ממנה. */
  char?: string | null;
  matchMm?: number;
  /**
   * הגשר עצמו כנתיב SVG, בקואורדינטות הפס.
   *
   * טבלה אומרת שנוסף גשר; היא לא אומרת אם הוא יושב **נכון**. עם הנתיב אפשר
   * לצייר אותו בצבע אחר מעל העיצוב ולראות את זה בעין — וזו השאלה האמיתית
   * כשבוחנים את המנגנון. חסר במחיקה: שם לא נוסף כלום.
   */
  pathD?: string;
}

export interface RestoreOptions {
  /** הגשרים שנחתכו בכיתוב, בקואורדינטות הפס. ריק/חסר = אין כיתוב בהרצה. */
  letterBridges?: readonly LetterBridge[];
  /** התקרה לגשר של אי בעיטור — המינימום המבני. הגשר בפועל צר ממנו כשהאי
   *  שהוא מחזיק קטן; ראה `ornamentBridgeWidth`. */
  ornamentBridgeMm: number;
  /** הרצפה לרוחב גשר (FAB.minLetterBridgeMm). אי צר ממנה אינו ניתן להחזקה. */
  minBridgeMm: number;
  /** מעל זה עדיף למחוק אי מאשר לגשר אותו. */
  maxSpanMm: number;
  /** מעל הנתח הזה מהמתכת, רכיב מנותק אינו "אי" אלא עיצוב שנשבר — ולא נוגעים בו. */
  maxDroppedFraction: number;
}

/** תת־קבוצה של `CutBridge` — רק מה שדרוש לזיהוי ולשחזור. */
export interface LetterBridge {
  char: string | null;
  counter: Box;
  rects: Box[];
  widthMm: number;
}

export interface RestoreResult {
  design: NormalizedDesign;
  records: BridgeRecord[];
}

const boxOf = (poly: Polygon): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};

const centre = (b: Box): Pt => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const spanOf = (b: Box) => Math.hypot(b[2] - b[0], b[3] - b[1]);

/**
 * החלל שהאי הזה הוא, אם הוא אחד מאלה שחתכנו.
 *
 * הסף נגזר מגודל האי ולא קבוע: המעקב מזיז קונטור של אות בשבריר מילימטר, אבל
 * שני חללים שכנים באותה מילה רחוקים זה מזה הרבה יותר. חצי מהאלכסון של האי
 * מפריד ביניהם בבטחה ועדיין סובלני לרעש המעקב.
 */
function matchLetter(
  island: Box,
  bridges: readonly LetterBridge[],
): { bridge: LetterBridge; distMm: number } | null {
  const [ix, iy] = centre(island);
  const tol = Math.max(0.5, spanOf(island) / 2);
  let best: { bridge: LetterBridge; distMm: number } | null = null;
  for (const bridge of bridges) {
    const [cx, cy] = centre(bridge.counter);
    const d = Math.hypot(cx - ix, cy - iy);
    if (d <= tol && (!best || d < best.distMm)) best = { bridge, distMm: d };
  }
  return best;
}

/**
 * כמה מהאי מותר לגשר לקחת — אותו יחס שהסטנסיל לוקח מחלל של אות
 * (`BRIDGE_COUNTER_RATIO`). זה לא במקרה אותו מספר: אותה שאלה, אותה תשובה.
 */
const ORNAMENT_COUNTER_RATIO = 0.4;

/**
 * רוחב הגשר לאי בעיטור — **נגזר מהאי שהוא מחזיק**, לא קבוע.
 *
 * עד כאן הוא היה `minBridgeCut` בדיוק, כלומר 1.5 מ"מ בפריט 1.5 מ"מ, לכל אי
 * ובלי קשר לגודלו. על נקודה בקוטר 0.8 מ"מ זה גשר כמעט כפול מהדבר שהוא מחזיק:
 * מה שנראה בעין הוא לא נקודה מגושרת אלא כתם שיוצא ממנו זנב. `minBridgeCut` הוא
 * המינימום למתכת **שנושאת** את הפריט; אי בעיטור, כמו חלל של אות, רק מוחזק
 * במקומו — ולכן הוא נמדד באותה אמת מידה (FAB.minLetterBridgeMm).
 *
 * `null` = האי צר מהרצפה, ולכן אין רוחב שגם מחזיק אותו וגם אינו רחב ממנו.
 */
export function ornamentBridgeWidth(
  islandAcrossMm: number,
  opts: Pick<RestoreOptions, "ornamentBridgeMm" | "minBridgeMm">,
): number | null {
  if (islandAcrossMm < opts.minBridgeMm) return null;
  const ideal = islandAcrossMm * ORNAMENT_COUNTER_RATIO;
  return Math.min(opts.ornamentBridgeMm, Math.max(ideal, opts.minBridgeMm));
}

/** הנקודה הקרובה ביותר ל-`p` על הקטע a→b. */
function onSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + t * dx, a[1] + t * dy];
}

/**
 * הקטע הקצר ביותר בין שני מתארים.
 *
 * מול **צלעות** ולא רק מול קודקודים: הנקודה הקרובה ביותר לרוב יושבת באמצע צלע,
 * ומדידה מקודקוד לקודקוד מחזירה מרחק גדול בהרבה — כלומר אי שאפשר לגשר היה
 * נראה רחוק מדי ונמחק.
 */
export function shortestLink(from: Polygon, to: Polygon): { a: Pt; b: Pt; distMm: number } {
  let best = { a: from[0][0], b: to[0][0], distMm: Infinity };
  const consider = (p: Pt, q: Pt, flip: boolean) => {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.distMm) best = flip ? { a: q, b: p, distMm: d } : { a: p, b: q, distMm: d };
  };
  const scan = (pts: Polygon, edges: Polygon, flip: boolean) => {
    for (const ring of pts) {
      for (const p of ring) {
        for (const other of edges) {
          for (let i = 0; i < other.length; i++) {
            consider(p, onSegment(p, other[i], other[(i + 1) % other.length]), flip);
          }
        }
      }
    }
  };
  scan(from, to, false);
  scan(to, from, true);
  return best;
}

/** מלבן ברוחב `w` סביב הקטע a→b, מוארך מעט לשני הצדדים כדי לוודא חפיפה. */
export function linkRect(a: Pt, b: Pt, w: number): Polygon {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // חצי רוחב לכל צד, ועוד חצי רוחב מעבר לכל קצה.
  const ex = ux * (w / 2), ey = uy * (w / 2);
  const px = (-uy * w) / 2, py = (ux * w) / 2;
  const a0: Pt = [a[0] - ex, a[1] - ey];
  const b0: Pt = [b[0] + ex, b[1] + ey];
  return [[
    [a0[0] + px, a0[1] + py],
    [b0[0] + px, b0[1] + py],
    [b0[0] - px, b0[1] - py],
    [a0[0] - px, a0[1] - py],
  ]];
}

export const rebuildDesign = (n: NormalizedDesign, cutUnion: MultiPolygon): NormalizedDesign => ({
  canonicalSvg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n.lengthMm} ${n.widthMm}">` +
    `<g id="cutouts">${cutUnion.map((p) => `<path d="${polygonToPathD(p)}" fill="black"/>`).join("")}</g></svg>`,
  lengthMm: n.lengthMm,
  widthMm: n.widthMm,
  cutouts: cutUnion.map((poly) => [poly]),
  cutUnion,
});

/**
 * מגשר כל אי מתכת, ומוחק רק את מה שאי אפשר לגשר.
 *
 * מחזיר את העיצוב כמו שהוא כשאין איים — כדי ש-`frameCutouts` יזהה "לא השתנה"
 * ולא ירוץ שוב על ולידציה בלי סיבה.
 */
export function restoreBridges(n: NormalizedDesign, opts: RestoreOptions): RestoreResult {
  const strip: MultiPolygon = [rectPolygon(0, 0, n.lengthMm, n.widthMm)];
  const material = difference(strip, n.cutUnion);
  if (material.length <= 1) return { design: n, records: [] };

  const areas = material.map(polygonArea);
  const total = areas.reduce((a, b) => a + b, 0);
  if (total <= 0) return { design: n, records: [] };
  let keep = 0;
  for (let i = 1; i < areas.length; i++) if (areas[i] > areas[keep]) keep = i;

  const main = material[keep];
  const islands = material.map((poly, i) => ({ poly, area: areas[i] })).filter((_, i) => i !== keep);
  const records: BridgeRecord[] = [];
  const bridges: MultiPolygon = [];
  const dropped: Polygon[] = [];

  for (const { poly: island, area } of islands) {
    const box = boxOf(island);
    const [x, y] = centre(box);
    const base = { x, y, widthMm: box[2] - box[0], heightMm: box[3] - box[1] };

    // אותה בלימה שהייתה, אבל **לכל רכיב בנפרד** ולא על סכום הרכיבים.
    //
    // רכיב שהוא נתח גדול מהפריט אינו אי אלא עיצוב שנשבר לשניים, ואין טעם לא
    // לגשר אותו ולא למחוק אותו. אבל הסכום הוא לא אותה שאלה: שתים־עשרה אותיות
    // שכל אחת מהן אחוז מהמתכת עוברות יחד את הסף, וההרצה שנמדדה כאן קיבלה
    // **אפס** גשרים — עיצוב שהאותיות בו מרחפות באוויר, בלי שורה אחת ביומן
    // שמסבירה למה. הבלימה נועדה לרכיב חריג, לא לכיתוב ארוך.
    if (area / total > opts.maxDroppedFraction) {
      records.push({ kind: "kept", ...base });
      continue;
    }

    const hit = matchLetter(box, opts.letterBridges ?? []);
    if (hit) {
      const drawn = hit.bridge.rects.map((r) => rectPolygon(r[0], r[1], r[2], r[3]));
      bridges.push(...drawn);
      records.push({
        kind: "letter",
        ...base,
        bridgeMm: hit.bridge.widthMm,
        char: hit.bridge.char,
        matchMm: Math.round(hit.distMm * 100) / 100,
        pathD: drawn.map((p) => polygonToPathD(p)).join(""),
      });
      continue;
    }

    // הצלע הצרה של האי היא זו שקובעת: גשר רחב ממנה בולע אותו משני צדדיו.
    const width = ornamentBridgeWidth(Math.min(base.widthMm, base.heightMm), opts);
    const link = shortestLink(island, main);
    if (width !== null && link.distMm <= opts.maxSpanMm) {
      const drawn = linkRect(link.a, link.b, width);
      bridges.push(drawn);
      records.push({
        kind: "ornament",
        ...base,
        bridgeMm: Math.round(width * 100) / 100,
        spanMm: Math.round(link.distMm * 100) / 100,
        pathD: polygonToPathD(drawn),
      });
    } else {
      dropped.push(island);
      records.push({ kind: "dropped", ...base, spanMm: Math.round(link.distMm * 100) / 100 });
    }
  }

  // שום אי לא נגשר ושום אי לא נמחק — אין מה לבנות מחדש. מוחזר האובייקט עצמו,
  // כדי ש-`frameCutouts` יזהה "לא השתנה" וידלג על ולידציה נוספת. הרשומות כן
  // חוזרות: "לא נגענו, וזו הסיבה" הוא בדיוק מה שהיומן היה חסר.
  if (bridges.length === 0 && dropped.length === 0) return { design: n, records };

  // גישור = החזרת מתכת, כלומר גריעה מהחיתוכים.
  let cutUnion = bridges.length ? difference(n.cutUnion, bridges) : n.cutUnion;

  // ומה שנשאר מנותק אחרי הגישור נמחק, בדיוק כמו קודם: החיתוכים נגזרים מחדש
  // מהמשלים של רכיב המתכת שנשאר. גזירה מחדש ולא סינון — האי היה חור *בתוך*
  // חיתוך, ומחיקתו מאחדת אותו עם החיתוך שהקיף אותו.
  if (dropped.length) {
    const after = difference(strip, cutUnion);
    let big = 0;
    for (let i = 1; i < after.length; i++) if (polygonArea(after[i]) > polygonArea(after[big])) big = i;
    cutUnion = difference(strip, [after[big]]);
  }

  return { design: rebuildDesign(n, cutUnion), records };
}
