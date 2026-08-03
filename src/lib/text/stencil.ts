import opentype from "opentype.js";
import { loadFace, DEFAULT_FONT, type FontId } from "./fonts";
import { samplePathToRings, ringToPathD } from "@/lib/geometry/paths";
import { union, difference, intersection, offset, ringArea, multiPolygonArea, rectPolygon } from "@/lib/geometry/poly";
import { resolveFab, FAB } from "@/lib/fabrication.config";
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
/**
 * מפריד שנשאר בתוך רצף LTR כשהוא חסום בין שני תווי LTR: הנקודות של תאריך
 * (`12.3.24`), הלוכסן (`3/12`), המקף והנקודתיים (`10:30`). בלעדיו כל קבוצת
 * ספרות מתהפכת בנפרד והתאריך יוצא הפוך — `24.3.12` במקום `12.3.24`.
 */
const LTR_CONNECTOR_RE = /[-./:]/;

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
    let j = i + 1;
    while (j < chars.length) {
      if (LTR_RUN_RE.test(chars[j])) { j++; continue; }
      // מפריד נשאר ברצף רק כשהתו הבא גם הוא LTR (התו הקודם כבר ידוע כ-LTR),
      // כלומר הוא חסום בין שני צדדים לטיניים — נקודה בתאריך, לא נקודת סוף משפט.
      if (LTR_CONNECTOR_RE.test(chars[j]) && LTR_RUN_RE.test(chars[j + 1] ?? "")) { j++; continue; }
      break;
    }
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
  /** טווח ה-x של כל תו, כדי שאפשר יהיה לשייך אי לאות שהוא בא ממנה. */
  spans: { char: string; x0: number; x1: number }[];
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
  const spans: Placed["spans"] = [];
  let x = 0;
  let prev: opentype.Glyph | null = null;
  for (const ch of visual) {
    const glyph = font.charToGlyph(ch);
    if (prev) x += (font.getKerningValue(prev, glyph) / font.unitsPerEm) * fontSize;
    full.extend(glyph.getPath(x, baseline, fontSize));
    const x0 = x;
    x += ((glyph.advanceWidth ?? 0) / font.unitsPerEm) * fontSize + trackingPx;
    spans.push({ char: ch, x0, x1: x });
    prev = glyph;
  }
  return { path: full, advance: x, spans };
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
    // FAB.minLetterBridgeMm הוא הרצפה שהנתיב החי (letteringImage) מעביר; בלעדיה
    // גשר של אות בטקסט קטן יורד מתחת למינימום הייצור ונשבר בחיתוך.
    const mp = await textToPolygons(
      content.trim(), x, y, height, align, fab.minBridgeCut, {}, FAB.minLetterBridgeMm,
    );
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
 * כמה הגשר חורג אל **מחוץ** לאות, כדי להבטיח חפיפה עם המתכת שסביבה.
 *
 * היה `width` — כלומר החריגה הייתה ברוחב הגשר עצמו, כ-0.75 מ"מ. זה מיותר
 * (החפיפה נקבעת מהמגע, לא מהאורך) ובעברית זה מזיק ממש: המרווח בין אותיות קטן
 * מזה, והגשר של ם׳ נוגע באות השכנה. חפיפה של עשירית מילימטר מספיקה לניתוח
 * הפוליגונים ואינה נראית.
 */
const BRIDGE_OVERSHOOT_MM = 0.1;

/**
 * כמה הגשר נכנס **לתוך** החלל. די בנגיעה כדי לחבר את האי, וכל מ"מ נוסף הוא
 * מתכת שאוכלת את החלל של האות. חצי רוחב הוא מרווח בטחון מול רעש המעקב.
 */
const BRIDGE_DEPTH_RATIO = 0.5;

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

/** תיבה `[x0, y0, x1, y1]` במ"מ. */
export type Box = [number, number, number, number];

/**
 * גשר שנחתך בכיתוב — היכן הוא, מה הוא מחזיק, ובאיזה כיוון.
 *
 * זה מה שמאפשר **להחזיר** אותו אם המודל לא צייר אותו: החלל שחוזר מהמעקב
 * מזוהה מול `counter`, והגשר משוחזר בדיוק ל-`rects` — כלומר מלמעלה בלטינית
 * ומהצד בעברית, בלי לנחש מחדש. ראה lib/geometry/restoreBridges.
 */
export interface CutBridge {
  /** האות שהחלל שייך לה, כשידועה. */
  char: string | null;
  /** תיבת החלל הסגור — המפתח לזיהוי אחרי המעקב. */
  counter: Box;
  /** הרצועות שהוסרו מהחיתוך. אחת או שתיים, לפי גודל החלל. */
  rects: Box[];
  widthMm: number;
  /** אופקי (עברית) או אנכי (לטינית) — הציר שהגשר חוצה. */
  sideways: boolean;
}

export interface StencilResult {
  polygons: MultiPolygon;
  /** ריק = לכל קונטור היה מקום לגשר בלי לבלוט לתוך האות. */
  tightBridges: TightBridge[];
  /** כל גשר שנחתך, גם כשהוא במידה מלאה. */
  bridges: CutBridge[];
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
  const bridges: CutBridge[] = [];
  const font = await loadFace(style.fontId ?? DEFAULT_FONT);
  const visual = visualOrder(text);
  const fontSize = sizeFor(font, heightMm);
  const trackingPx = (style.trackingEm ?? 0) * heightMm;

  // y = מרכז אנכי של הטקסט → baseline
  const baseline = y + heightMm / 2;
  const { path, advance, spans } = place(font, visual, fontSize, baseline, trackingPx);
  let startX = x;
  if (align === "middle") startX = x - advance / 2;
  else if (align === "end") startX = x - advance;
  /** האות שהאי הזה בא ממנה — לפי מרכזו, בקואורדינטות אחרי ההזזה. */
  const charAt = (cx: number): string | null =>
    spans.find((sp) => cx >= sp.x0 + startX && cx <= sp.x1 + startX)?.char ?? null;

  const d = path.toPathData(3);
  if (!d) return { polygons: [], tightBridges, bridges };

  const subs = samplePathToRings(d);
  // גליפים: טבעות בכיוון הדומיננטי = מילוי, הפוכות = counters
  const rings = subs.map((s) => s.ring.map(([px, py]) => [px + startX, py] as [number, number]))
    .filter((r) => r.length >= 3);
  if (rings.length === 0) return { polygons: [], tightBridges, bridges };
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
  if (solids.length === 0) return { polygons: [], tightBridges, bridges };
  let glyphs = difference(
    union(...solids),
    holes.length ? union(...holes.map((h) => [[[...h.ring].reverse()]] as MultiPolygon)) : [],
  );

  // גישור: לכל קונטור פנימי גשר שמוסר מהחיתוך ומחבר את האי לחומר שמסביב.
  //
  // **הכיוון נקבע לפי הכתב, ולא אחד לשניהם.** שני הכתבים רוצים הפוך, וזו לא
  // העדפה אלא זהות האות:
  //
  //  · **עברית — מהצד.** ההבדל בין ם׳ ל-ח׳ ובין ס׳ ל-ט׳ הוא הסגירה האופקית:
  //    חריץ בבר התחתון קורא ח׳, בעליון קורא ט׳. גישור אנכי הפך `פספסתי`
  //    ל-`פטפטתי` — אות אחרת, לא אות פגומה. נמדד על שמונה הפנים.
  //
  //  · **לטינית — מלמעלה/מלמטה.** בדיוק ההפך: חריץ בצד, באמצע הגובה, חותך את
  //    הקשת בנקודה הרחבה שלה ומעביר את האות לאות אחרת — `o` יצאה `C`, `a`
  //    יצאה `cl`. זה גם מה שפונטי סטנסיל לטיניים עושים: השבר יושב בכתף או
  //    בראש הקערה, לא בצידה.
  //
  // **צד אחד בלבד**, בשני הכתבים: פס שעובר מקצה לקצה קוטע את שני הגזעים; אי
  // שמוחזק מגשר יחיד מוחזק באותה מידה, והנזק נחתך בחצי.
  //
  // האיים נמדדים מצד המתכת ולא מכיווני הטבעות של הפונט — ראה islandsOf.
  for (const h of islandsOf(glyphs, heightMm)) {
    const [hx0, hy0, hx1, hy1] = h.bbox;
    const cx = (hx0 + hx1) / 2;
    const cy = (hy0 + hy1) / 2;
    const outer = enclosing(solidBoxes, h.bbox);
    // אנכי בעברית, אופקי בלטינית — הציר שהגשר **חוצה**.
    const char = charAt(cx);
    const sideways = HEBREW_RE.test(char ?? "");
    /** המידה של הקונטור לאורך הציר שהגשר צר בו. */
    const across = sideways ? hy1 - hy0 : hx1 - hx0;
    /** ...ולאורך הציר שהוא נכנס בו. */
    const along = sideways ? hx1 - hx0 : hy1 - hy0;

    // **רוחב הגשר נגזר מהקונטור שהוא מחזיק**, ולא מהמינימום למבנה.
    //
    // `minBridgeCut` הוא 1.5 מ"מ, והקונטור של `e` באות בגובה 6 מ"מ הוא 0.85 מ"מ
    // — הגשר היה 177% ממנו, כלומר לא גישר אלא בלע אותו ואכל את הגזעים משני
    // צדיו. גשר צר יותר מחזיק את האי באותה מידה (הוא מוחזק, לא נושא עומס)
    // ומשאיר את האות קריאה. הרצפה היא FAB.minLetterBridgeMm.
    const ideal = across * BRIDGE_COUNTER_RATIO;
    const width = Math.min(bridgeWidthMm, Math.max(ideal, minWidthMm));
    // הרצפה נגעה: הקונטור קטן מכדי להכיל גשר גם במינימום לאות, ולכן הגשר
    // בולט לתוכו. זה לא עניין של ייצור אלא של איך האות נראית — ולכן זה מדווח
    // ללקוחה לאישור ולא נבלע כאן.
    if (ideal < minWidthMm && width > ideal) {
      tightBridges.push({ widthMm: width, counterMm: across, x: cx, y: cy });
    }

    // הגזע הדק מבין השניים — שם הגשר קצר יותר ולכן פחות נראה.
    const near = sideways ? hx0 - outer[0] <= outer[2] - hx1 : hy0 - outer[1] <= outer[3] - hy1;
    // מהחומר שמחוץ לאות עד **קצת** לתוך הקונטור, ושני הקצוות קצרים ככל שאפשר:
    // מה שמחבר הוא המגע, לא האורך. גשר ארוך אינו מחזיק טוב יותר — הוא רק בולט
    // החוצה אל האות השכנה ופנימה אל תוך החלל.
    const depth = Math.min(width * BRIDGE_DEPTH_RATIO, along / 2);
    const out = BRIDGE_OVERSHOOT_MM;
    const [a0, a1] = sideways
      ? (near ? [outer[0] - out, hx0 + depth] : [hx1 - depth, outer[2] + out])
      : (near ? [outer[1] - out, hy0 + depth] : [hy1 - depth, outer[3] + out]);
    // קונטור ארוך מחזיק שני גשרים בלי להיסגר; קצר מקבל אחד באמצע.
    const center = sideways ? cy : cx;
    const offsets = across > width * 4 ? [center - across / 4, center + across / 4] : [center];
    const strips: MultiPolygon = offsets.map((s) => sideways
      ? rectPolygon(a0, s - width / 2, a1, s + width / 2)
      : rectPolygon(s - width / 2, a0, s + width / 2, a1));
    bridges.push({
      char,
      counter: [hx0, hy0, hx1, hy1],
      rects: strips.map((poly) => bboxOf(poly[0]) as Box),
      widthMm: width,
      sideways,
    });
    glyphs = difference(glyphs, strips);
  }

  return {
    polygons: glyphs.filter((p) => multiPolygonArea([p]) > 0.01),
    tightBridges,
    bridges,
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
