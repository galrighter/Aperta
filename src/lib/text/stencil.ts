import opentype from "opentype.js";
import { loadFace, DEFAULT_FONT, type FontId } from "./fonts";
import { samplePathToRings, ringToPathD } from "@/lib/geometry/paths";
import { union, difference, intersection, offset, ringArea, multiPolygonArea, rectPolygon } from "@/lib/geometry/poly";
import { resolveFab } from "@/lib/fabrication.config";
import type { DesignDims } from "@/lib/geometry/validate";
import type { MultiPolygon, Ring } from "@/lib/geometry/types";

// סעיף 6.4: המרת <text-request content x y height align/> לנתיבי אותיות, וגם
// מנוע הכיתוב של תמונת הייחוס (src/lib/render/baseImage.ts).
//
// פונטים: מאגר OFL בן שמונה פנים (./fonts). לא נמצא פונט סטנסיל עברי חופשי
// מתאים, לכן ממומש הגישור האוטומטי מהמפרט: לכל קונטור פנימי (counter של אות
// כמו ם/O) נוספים שני גשרים אנכיים ברוחב minBridgeCut שמחברים את ה"אי" לחומר
// שמסביב.

const TEXT_REQUEST_RE = /<text-request\b([^>]*?)\/?>(?:<\/text-request>)?/gi;

function attr(attrsStr: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(attrsStr);
  return m ? m[1] : null;
}

/** ההרחבה שמפרידה תפר ברוחב אפס בגליף לחור אמיתי. ראה islandsOf. */
const SEAM_MM = 0.05;

const HEBREW_RE = /[֐-׿]/;
/** מה שנקרא משמאל לימין גם בתוך משפט עברי: לטינית, ספרות. */
const LTR_RUN_RE = /[A-Za-z0-9]/;

/** סוגריים וכיוצא בהם מתהפכים כשהסדר מתהפך, אחרת "(רייטר" יוצא ")רייטר". */
const MIRROR: Record<string, string> = {
  "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<",
};

/**
 * סדר התווים שיש למסור ל-opentype, שמצייר תמיד משמאל לימין.
 *
 * opentype.js לא מבצע bidi. היפוך המחרוזת לבדו — מה שהיה כאן — נותן עברית
 * תקינה אבל הופך גם את מה שאסור להפוך: `ענבל ABC 12` חזר כ-`21 CBA לבנע`,
 * כלומר השם נכון והמספר והמילה הלטינית הפוכים. לכן אחרי ההיפוך הכולל מוחזרים
 * למקומם רצפים של לטינית וספרות — קירוב פשוט ל-UAX#9 שמכסה את מה שבאמת מוזמן
 * על תכשיט (שם, תאריך, מילה לועזית), ואינו bidi מלא.
 */
export function visualOrder(text: string): string {
  if (!HEBREW_RE.test(text)) return text;
  const chars = [...text].reverse().map((c) => MIRROR[c] ?? c);
  for (let i = 0; i < chars.length; ) {
    if (!LTR_RUN_RE.test(chars[i])) { i++; continue; }
    let j = i;
    while (j < chars.length && LTR_RUN_RE.test(chars[j])) j++;
    // רווח בין שתי מילים לטיניות שייך לרצף; רווח בגבול העברית אינו.
    const run = chars.slice(i, j).reverse();
    chars.splice(i, j - i, ...run);
    i = j;
  }
  return chars.join("");
}

export interface TextStyle {
  fontId?: FontId;
  /** מרווח בין־אותי כשבריר מגובה האות. שלילי = צפוף. */
  trackingEm?: number;
}

/** מידות הטקסט לפני הגישור, במ"מ. הכל ליניארי ב-heightMm. */
export interface TextMetrics {
  /** רוחב ההתקדמות הכולל — כולל המרווח האחרון. */
  widthMm: number;
  /** גובה הדיו בפועל של המחרוזת הזו (כולל יורדות אם יש). */
  inkHeightMm: number;
}

interface Placed {
  path: opentype.Path;
  advance: number;
}

/**
 * פריסת הגליפים ביד ולא דרך `font.getPath`, כי רק כך אפשר להוסיף מרווח
 * בין־אותי — פרמטר סגנון שאין לו מחיר (עוד "פנים" בלי עוד פונט).
 */
function place(
  font: opentype.Font,
  visual: string,
  fontSize: number,
  baseline: number,
  trackingPx: number,
): Placed {
  const full = new opentype.Path();
  let x = 0;
  let prev: opentype.Glyph | null = null;
  for (const ch of visual) {
    const glyph = font.charToGlyph(ch);
    if (prev) x += (font.getKerningValue(prev, glyph) / font.unitsPerEm) * fontSize;
    full.extend(glyph.getPath(x, baseline, fontSize));
    x += ((glyph.advanceWidth ?? 0) / font.unitsPerEm) * fontSize + trackingPx;
    prev = glyph;
  }
  return { path: full, advance: x };
}

/** גודל הפונט שנותן `heightMm` בגובה אות (cap height), כמו שהיה מאז ומתמיד. */
function sizeFor(font: opentype.Font, heightMm: number): number {
  const upm = font.unitsPerEm;
  const capHeight = (font.tables.os2?.sCapHeight as number | undefined) || upm * 0.7;
  return (heightMm * upm) / capHeight;
}

/** מדידה בלי לחשב פוליגונים — לבחירת גובה שנכנס לפס. */
export async function measureText(
  text: string,
  heightMm: number,
  style: TextStyle = {},
): Promise<TextMetrics> {
  const font = await loadFace(style.fontId ?? DEFAULT_FONT);
  const visual = visualOrder(text);
  const fontSize = sizeFor(font, heightMm);
  const { path, advance } = place(font, visual, fontSize, 0, (style.trackingEm ?? 0) * heightMm);
  const bb = path.getBoundingBox();
  const inkHeightMm = Number.isFinite(bb.y2 - bb.y1) ? bb.y2 - bb.y1 : 0;
  return { widthMm: advance, inkHeightMm };
}

export async function renderTextRequests(svg: string, dims: DesignDims): Promise<string> {
  const fab = resolveFab(dims.thicknessMm, dims.productType);
  // ההחלפה עצמה סינכרונית, ולכן הפוליגונים מחושבים מראש בסדר ההופעה.
  const requests = [...svg.matchAll(TEXT_REQUEST_RE)];
  const rendered = await Promise.all(requests.map(async (m) => {
    const attrsStr = m[1];
    const content = attr(attrsStr, "content") ?? "";
    const x = parseFloat(attr(attrsStr, "x") ?? "NaN");
    const y = parseFloat(attr(attrsStr, "y") ?? "NaN");
    const height = parseFloat(attr(attrsStr, "height") ?? "NaN");
    const align = (attr(attrsStr, "align") ?? "middle") as "start" | "middle" | "end";
    if (!content.trim() || !isFinite(x) || !isFinite(y) || !isFinite(height) || height <= 0) {
      // בקשה לא תקינה — מסירים; הוולידציה תמשיך על שאר העיצוב
      return "";
    }
    const mp = await textToPolygons(content.trim(), x, y, height, align, fab.minBridgeCut);
    return mp
      .map((poly) => `<path d="${poly.map((r) => ringToPathD(r)).join("")}" fill="black"/>`)
      .join("");
  }));
  let i = 0;
  return svg.replace(TEXT_REQUEST_RE, () => rendered[i++]);
}

/**
 * כמה מגובה הקונטור מותר לגשר לקחת. הגשר מחזיק אי, הוא לא נושא עומס, ולכן
 * צר מספיק כדי שהאות תישאר קריאה מחזיק אותו באותה מידה.
 */
const BRIDGE_COUNTER_RATIO = 0.4;

/**
 * גשר שהקונטור שלו קטן מכדי להכיל אפילו את המינימום לאות: הוא נשאר על
 * המינימום ובולט לתוך האות. זה מה שהלקוחה מתבקשת לאשר ויזואלית.
 */
export interface TightBridge {
  /** הרוחב שנחתך בפועל — המינימום לאות. */
  widthMm: number;
  /** גובה הקונטור שהוא נכנס אליו. היחס ביניהם הוא גודל הפגיעה. */
  counterMm: number;
  x: number;
  y: number;
}

export interface StencilResult {
  polygons: MultiPolygon;
  /** ריק = לכל קונטור היה מקום לגשר בלי לבלוט לתוך האות. */
  tightBridges: TightBridge[];
}

/** טקסט → פוליגונים בקואורדינטות מ"מ, כולל גישור קונטורים פנימיים.
 *  עוטף את textToStencil למי שלא צריך את דיווח הגשרים. */
export async function textToPolygons(
  text: string,
  x: number,
  y: number,
  heightMm: number,
  align: "start" | "middle" | "end",
  bridgeWidthMm: number,
  style: TextStyle = {},
  minWidthMm = 0,
): Promise<MultiPolygon> {
  return (await textToStencil(text, x, y, heightMm, align, bridgeWidthMm, style, minWidthMm)).polygons;
}

/** אותו חיתוך, עם דיווח על גשרים שיצאו צרים מהמינימום לייצור. */
export async function textToStencil(
  text: string,
  x: number,
  y: number,
  heightMm: number,
  align: "start" | "middle" | "end",
  bridgeWidthMm: number,
  style: TextStyle = {},
  /** הרצפה לגשר של אות (FAB.minLetterBridgeMm). 0 = בלי רצפה. */
  minWidthMm = 0,
): Promise<StencilResult> {
  const tightBridges: TightBridge[] = [];
  const font = await loadFace(style.fontId ?? DEFAULT_FONT);
  const visual = visualOrder(text);
  const fontSize = sizeFor(font, heightMm);
  const trackingPx = (style.trackingEm ?? 0) * heightMm;

  // y = מרכז אנכי של הטקסט → baseline
  const baseline = y + heightMm / 2;
  const { path, advance } = place(font, visual, fontSize, baseline, trackingPx);
  let startX = x;
  if (align === "middle") startX = x - advance / 2;
  else if (align === "end") startX = x - advance;

  const d = path.toPathData(3);
  if (!d) return { polygons: [], tightBridges };

  const subs = samplePathToRings(d);
  // גליפים: טבעות בכיוון הדומיננטי = מילוי, הפוכות = counters
  const rings = subs.map((s) => s.ring.map(([px, py]) => [px + startX, py] as [number, number]))
    .filter((r) => r.length >= 3);
  if (rings.length === 0) return { polygons: [], tightBridges };
  const areas = rings.map(ringArea);
  const total = areas.reduce((s, a) => s + a, 0);
  const dominant = Math.sign(total) || 1;
  const solids: MultiPolygon[] = [];
  const solidBoxes: [number, number, number, number][] = [];
  const holes: { ring: Ring; bbox: [number, number, number, number] }[] = [];
  for (let i = 0; i < rings.length; i++) {
    if (Math.sign(areas[i]) === dominant) {
      solids.push([[rings[i]]]);
      solidBoxes.push(bboxOf(rings[i]));
    } else holes.push({ ring: rings[i], bbox: bboxOf(rings[i]) });
  }
  if (solids.length === 0) return { polygons: [], tightBridges };
  let glyphs = difference(
    union(...solids),
    holes.length ? union(...holes.map((h) => [[[...h.ring].reverse()]] as MultiPolygon)) : [],
  );

  // גישור: לכל קונטור פנימי גשר **אופקי מהצד**, ברוחב הגשר, שמוסר מהחיתוך
  // ומחבר את האי לחומר שמסביב.
  //
  // שתי החלטות כאן, ושתיהן נמדדו על שמונה הפנים מול `פספסתי מםעטד`:
  //
  // 1. **מהצד ולא מלמעלה/מלמטה.** בעברית ההבדל בין ם׳ ל-ח׳ ובין ס׳ ל-ט׳ הוא
  //    בדיוק הסגירה האופקית: חריץ בבר התחתון קורא ח׳, חריץ בעליון קורא ט׳.
  //    הגרסה הראשונה גישרה אנכית ו-`פספסתי` יצא `פטפטתי` — **אות אחרת**, לא
  //    אות פגומה, וזה בלבל גם אותנו במחקר. חריץ בגזע הצדדי, לעומת זאת, לא
  //    מזיז שום אות עברית לשכנתה, וזה גם מה שפונטי סטנסיל לטיניים עושים ל-O.
  //
  // 2. **צד אחד בלבד.** פס שעובר מקצה לקצה קוטע את שני הגזעים; אי שמוחזק
  //    מגשר יחיד מוחזק באותה מידה, והנזק נחתך בחצי.
  //
  // האיים נמדדים מצד המתכת ולא מכיווני הטבעות של הפונט — ראה islandsOf.
  for (const h of islandsOf(glyphs, heightMm)) {
    const [hx0, hy0, hx1, hy1] = h.bbox;
    const height = hy1 - hy0;
    const cy = (hy0 + hy1) / 2;
    const outer = enclosing(solidBoxes, h.bbox);
    // **רוחב הגשר נגזר מהקונטור שהוא מחזיק**, ולא מהמינימום לייצור לבדו.
    //
    // `minBridgeCut` הוא 1.5 מ"מ, והקונטור של `e` באות בגובה 6 מ"מ הוא 0.85 מ"מ
    // — הגשר היה 177% ממנו, כלומר לא גישר אלא בלע אותו ואכל את הגזעים משני
    // צדיו. ספירת הטבעות: 2 לפני, 1 אחרי. גם באות 12 מ"מ הוא עדיין 89%.
    // האותיות שנפגעו הן בדיוק אלה שיש להן קונטור קטן — e, a, ס׳ — והשאר נראו
    // תקינות, ולכן זה נראה כמו שגיאה של מודל התמונה ולא כמו הייחוס שנמסר לו.
    //
    // התקרה היא שבריר מגובה הקונטור: גשר צר יותר מחזיק את האי באותה מידה
    // (הוא מוחזק, לא נושא עומס) ומשאיר את האות קריאה. מה שהוא **כן** עולה הוא
    // שגשר מתחת ל-minBridgeCut דק מכפי שהייצור מבטיח — וזה מדווח החוצה
    // כ-narrowBridges במקום להיבלע כאן.
    const ideal = height * BRIDGE_COUNTER_RATIO;
    const width = Math.min(bridgeWidthMm, Math.max(ideal, minWidthMm));
    // הרצפה נגעה: הקונטור קטן מכדי להכיל גשר גם במינימום לאות, ולכן הגשר
    // בולט לתוכו. זה לא עניין של ייצור אלא של איך האות נראית — ולכן זה מדווח
    // ללקוחה לאישור ולא נבלע כאן.
    if (ideal < minWidthMm && width > ideal) {
      tightBridges.push({ widthMm: width, counterMm: height, x: (hx0 + hx1) / 2, y: cy });
    }
    // הגזע הדק מבין השניים — שם הגשר קצר יותר ולכן פחות נראה.
    const left = hx0 - outer[0] <= outer[2] - hx1;
    // מהחומר שמחוץ לאות עד **קצת** לתוך הקונטור. הקצה החיצוני חורג מהאות ולא
    // מוריד שם כלום (אין חיתוך מחוץ לאות); הקצה הפנימי הוא מה שמבטיח חיבור,
    // וכל מ"מ נוסף מעבר לו הוא רק מתכת שאוכלת את החלל של האות. הגרסה הקודמת
    // הגיעה עד מרכז הקונטור, כלומר בלעה חצי ממנו — וזה מה שגרם ל-ס׳ להיראות
    // כמו כ׳ בייחוס. עומק של רוחב גשר מספיק לחפיפה ודאית.
    const depth = Math.min(width, (hx1 - hx0) / 2);
    const [x0s, x1s] = left
      ? [outer[0] - width, hx0 + depth]
      : [hx1 - depth, outer[2] + width];
    const offsets = height > width * 4 ? [cy - height / 4, cy + height / 4] : [cy];
    const strips: MultiPolygon = offsets.map((sy) => rectPolygon(
      x0s, sy - width / 2, x1s, sy + width / 2,
    ));
    glyphs = difference(glyphs, strips);
  }

  return {
    polygons: glyphs.filter((p) => multiPolygonArea([p]) > 0.01),
    tightBridges,
  };
}

/**
 * האיים שהחיתוך באמת יוצר — נמדדים **מצד המתכת**, בדיוק כמו V3.
 *
 * הדרך המתבקשת (טבעת פנימית של גליף = חור) לא עובדת: לא כל פונט מצייר קונטור
 * פנימי כתת-מסלול נפרד. הס״ך של Frank Ruhl Libre היא מסלול **אחד** שמקיף את
 * החוץ, נכנס דרך תפר ברוחב אפס ומקיף את הפנים — לפי סימני השטח אין לה חור,
 * לפי כלל המילוי יש, ולייזר התפר בכלול אפס אינו חיבור. היא לא גושרה והאי נפל
 * ב-V3. לכן החישוב כאן זהה לזה של הוולידציה: מחסרים את החיתוך ממלבן שמקיף
 * אותו, וכל טבעת פנימית של מה שנשאר היא אי מתכת מנותק.
 */
function islandsOf(glyphs: MultiPolygon, margin: number): { bbox: [number, number, number, number] }[] {
  const [x0, y0, x1, y1] = polygonsBBox(glyphs);
  if (!isFinite(x0)) return [];
  const box: [number, number, number, number] = [x0 - margin, y0 - margin, x1 + margin, y1 + margin];
  // החיתוך מורחב בשערה לפני החישוב. זה לא ניקוי נומרי אלא הצהרה פיזיקלית:
  // ס׳ של Frank Ruhl Libre מצוירת כמסלול אחד שנכנס לתוך עצמו דרך תפר ברוחב
  // אפס, ולפי הטופולוגיה החלל שלה מחובר לחוץ — אבל תפר ברוחב אפס אינו חיבור
  // שלייזר יכול לחתוך, והחלל ייפול. ההרחבה פותחת אותו לחור אמיתי, וכל הפנים
  // נמדדות אז באותה דרך.
  const around = difference([rectPolygon(...box)], offset(glyphs, SEAM_MM));

  // האי הוא **פוליגון שלם** של מתכת שאינו נוגע בגבול התיבה, ולא טבעת פנימית.
  // הטבעות הפנימיות של המתכת שמסביב הן צלליות האותיות עצמן — מדידה לפיהן
  // החזירה את תיבת האות כולה במקום את החלל שלה, והגשר נחת במקום שגוי.
  const touches = (b: [number, number, number, number]) =>
    b[0] <= box[0] + 1e-6 || b[1] <= box[1] + 1e-6 || b[2] >= box[2] - 1e-6 || b[3] >= box[3] - 1e-6;
  return around
    .map((poly) => ({ bbox: bboxOf(poly[0]) }))
    .filter((p) => !touches(p.bbox));
}

/** תיבת האות שסוגרת על הקונטור — ממנה נמדד לאיזה צד הגשר קצר יותר.
 *  אם משום מה אין מכילה, נופלים לתיבת הקונטור עצמו והגשר יהיה קצר מדי
 *  בלי לשבור כלום. */
function enclosing(
  boxes: [number, number, number, number][],
  hole: [number, number, number, number],
): [number, number, number, number] {
  let best: [number, number, number, number] | null = null;
  for (const b of boxes) {
    if (b[0] > hole[0] || b[1] > hole[1] || b[2] < hole[2] || b[3] < hole[3]) continue;
    if (!best || (b[2] - b[0]) * (b[3] - b[1]) < (best[2] - best[0]) * (best[3] - best[1])) best = b;
  }
  return best ?? hole;
}

function bboxOf(ring: Ring): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of ring) {
    if (px < x0) x0 = px;
    if (py < y0) y0 = py;
    if (px > x1) x1 = px;
    if (py > y1) y1 = py;
  }
  return [x0, y0, x1, y1];
}

/** תיבת המידה של קבוצת פוליגונים — לפריסה מדויקת אחרי הגישור. */
export function polygonsBBox(mp: MultiPolygon): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of mp) {
    for (const ring of poly) {
      const [a, b, c, dd] = bboxOf(ring);
      if (a < x0) x0 = a;
      if (b < y0) y0 = b;
      if (c > x1) x1 = c;
      if (dd > y1) y1 = dd;
    }
  }
  return [x0, y0, x1, y1];
}

/** הזזה קשיחה של הפוליגונים — הגשרים נעים איתם ולכן הרוחב שלהם נשמר. */
export function translatePolygons(mp: MultiPolygon, dx: number, dy: number): MultiPolygon {
  return mp.map((poly) => poly.map((ring) => ring.map(([px, py]) => [px + dx, py + dy] as [number, number])));
}
