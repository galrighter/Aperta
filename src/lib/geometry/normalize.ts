import { XMLParser } from "fast-xml-parser";
import { samplePathToRings, ringToPathD } from "./paths";
import {
  union, difference, intersection, differenceSafe, intersectionSafe,
  offset, rectPolygon, ringArea, multiPolygonArea, polygonArea,
} from "./poly";
import type { MultiPolygon, Polygon, Ring } from "./types";

// נרמול SVG גולמי מה-LLM לפי החוזה (סעיף 5): פרסינג קפדני → המרת primitives
// ל-paths → דגימה → איחוד חופפים → פליטת SVG קנוני.
// כל סטייה מהחוזה נזרקת כ-ContractViolation ומוחזרת ל-LLM לתיקון.

export class ContractViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractViolation";
  }
}

export interface NormalizedDesign {
  canonicalSvg: string;
  lengthMm: number;
  widthMm: number;
  /** פוליגונים דגומים לכל cutout (אלמנט מקורי), לפני איחוד */
  cutouts: MultiPolygon[];
  /** איחוד כל ה-cutouts */
  cutUnion: MultiPolygon;
}

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

function parseXml(svg: string): XmlNode {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    preserveOrder: true,
    allowBooleanAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
  let doc: unknown[];
  try {
    doc = parser.parse(svg);
  } catch (e) {
    throw new ContractViolation(`SVG is not well-formed XML: ${e instanceof Error ? e.message : e}`);
  }
  const toNode = (obj: Record<string, unknown>): XmlNode | null => {
    const keys = Object.keys(obj).filter((k) => k !== ":@" && k !== "#text");
    if (keys.length === 0) return null;
    const tag = keys[0];
    if (tag === "?xml" || tag.startsWith("!")) return null;
    const attrs = (obj[":@"] as Record<string, string>) ?? {};
    const rawChildren = (obj[tag] as Record<string, unknown>[]) ?? [];
    const children: XmlNode[] = [];
    for (const c of rawChildren) {
      if ("#text" in c) {
        const t = String(c["#text"]).trim();
        if (t.length > 0) throw new ContractViolation(`Unexpected text content inside <${tag}>: "${t.slice(0, 30)}"`);
        continue;
      }
      const n = toNode(c);
      if (n) children.push(n);
    }
    return { tag, attrs, children };
  };
  const roots = doc.map((o) => toNode(o as Record<string, unknown>)).filter((n): n is XmlNode => n !== null);
  if (roots.length !== 1) throw new ContractViolation(`Expected exactly one root element, got ${roots.length}`);
  return roots[0];
}

const ALLOWED_SVG_ATTRS = new Set(["viewBox", "xmlns", "xmlns:xlink", "version"]);
const BLACK_RE = /^(black|#000|#000000|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/i;

function num(v: string | undefined, name: string): number {
  if (v === undefined) throw new ContractViolation(`Missing numeric attribute ${name}`);
  const n = parseFloat(v);
  if (!isFinite(n)) throw new ContractViolation(`Attribute ${name} is not a number: "${v}"`);
  return n;
}

/** בדיקת עמידה בחוזה + חילוץ ה-d של כל cutout. פרימיטיבים מומרים ל-path (קשתות מדויקות). */
function extractCutoutPaths(root: XmlNode, expectL: number, expectW: number): string[] {
  if (root.tag !== "svg") throw new ContractViolation(`Root element must be <svg>, got <${root.tag}>`);
  for (const a of Object.keys(root.attrs)) {
    if (a === "width" || a === "height") {
      throw new ContractViolation(`<svg> must not have width/height attributes (only viewBox)`);
    }
    if (!ALLOWED_SVG_ATTRS.has(a)) throw new ContractViolation(`Attribute "${a}" is not allowed on <svg>`);
  }
  const vb = root.attrs["viewBox"];
  if (!vb) throw new ContractViolation(`<svg> is missing viewBox`);
  const parts = vb.trim().split(/[\s,]+/).map(parseFloat);
  if (parts.length !== 4 || parts.some((p) => !isFinite(p))) {
    throw new ContractViolation(`viewBox must be "0 0 L W", got "${vb}"`);
  }
  const [x0, y0, L, W] = parts;
  if (x0 !== 0 || y0 !== 0) throw new ContractViolation(`viewBox must start at 0 0, got "${vb}"`);
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (!close(L, expectL) || !close(W, expectW)) {
    throw new ContractViolation(
      `viewBox must be "0 0 ${expectL} ${expectW}" (strip dimensions in mm), got "${vb}"`,
    );
  }

  if (root.children.length !== 1 || root.children[0].tag !== "g") {
    throw new ContractViolation(`<svg> must contain exactly one <g id="cutouts"> layer`);
  }
  const g = root.children[0];
  if (g.attrs["id"] !== "cutouts") {
    throw new ContractViolation(`The <g> layer must have id="cutouts", got id="${g.attrs["id"] ?? ""}"`);
  }
  for (const a of Object.keys(g.attrs)) {
    if (a !== "id" && a !== "fill") throw new ContractViolation(`Attribute "${a}" is not allowed on <g>`);
  }

  const ds: string[] = [];
  for (const el of g.children) {
    checkShapeAttrs(el);
    switch (el.tag) {
      case "path": {
        const d = el.attrs["d"];
        if (!d) throw new ContractViolation(`<path> is missing the d attribute`);
        ds.push(d);
        break;
      }
      case "circle": {
        const cx = num(el.attrs["cx"], "cx"), cy = num(el.attrs["cy"], "cy"), r = num(el.attrs["r"], "r");
        if (r <= 0) throw new ContractViolation(`<circle> r must be positive`);
        ds.push(
          `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`,
        );
        break;
      }
      case "ellipse": {
        const cx = num(el.attrs["cx"], "cx"), cy = num(el.attrs["cy"], "cy");
        const rx = num(el.attrs["rx"], "rx"), ry = num(el.attrs["ry"], "ry");
        if (rx <= 0 || ry <= 0) throw new ContractViolation(`<ellipse> rx/ry must be positive`);
        ds.push(
          `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`,
        );
        break;
      }
      case "rect": {
        const x = num(el.attrs["x"], "x"), y = num(el.attrs["y"], "y");
        const w = num(el.attrs["width"], "width"), h = num(el.attrs["height"], "height");
        if (w <= 0 || h <= 0) throw new ContractViolation(`<rect> width/height must be positive`);
        let rx = el.attrs["rx"] !== undefined ? num(el.attrs["rx"], "rx") : 0;
        let ry = el.attrs["ry"] !== undefined ? num(el.attrs["ry"], "ry") : rx;
        if (rx === 0 && ry > 0) rx = ry;
        rx = Math.min(rx, w / 2);
        ry = Math.min(ry, h / 2);
        if (rx > 0 && ry > 0) {
          ds.push(
            `M${x + rx} ${y}L${x + w - rx} ${y}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
            `L${x + w} ${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
            `L${x + rx} ${y + h}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
            `L${x} ${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`,
          );
        } else {
          ds.push(`M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`);
        }
        break;
      }
      default:
        throw new ContractViolation(
          `Element <${el.tag}> is not allowed inside the cutouts layer (only path/circle/ellipse/rect)`,
        );
    }
  }
  if (ds.length === 0) throw new ContractViolation(`The cutouts layer is empty — at least one cutout is required`);
  return ds;
}

const FORBIDDEN_SHAPE_ATTRS = new Set(["transform", "clip-path", "style", "filter", "mask", "opacity", "fill-opacity"]);

function checkShapeAttrs(el: XmlNode) {
  if (el.children.length > 0) throw new ContractViolation(`<${el.tag}> must not have child elements`);
  const fill = el.attrs["fill"];
  if (fill !== undefined && !BLACK_RE.test(fill)) {
    throw new ContractViolation(`<${el.tag}> fill must be "black", got "${fill}"`);
  }
  const stroke = el.attrs["stroke"];
  if (stroke !== undefined && stroke !== "none") {
    throw new ContractViolation(`<${el.tag}> must not have a stroke`);
  }
  for (const a of Object.keys(el.attrs)) {
    if (FORBIDDEN_SHAPE_ATTRS.has(a)) {
      throw new ContractViolation(`Attribute "${a}" is not allowed on <${el.tag}>`);
    }
  }
}

/** דגימת d לפוליגון: תתי-נתיב בכיוון הפוך לדומיננטי = חורים (קירוב nonzero) */
function pathToPolygons(d: string, index: number): MultiPolygon {
  let subs;
  try {
    subs = samplePathToRings(d);
  } catch (e) {
    throw new ContractViolation(`Cutout #${index + 1}: invalid path data — ${e instanceof Error ? e.message : e}`);
  }
  if (subs.length === 0) throw new ContractViolation(`Cutout #${index + 1}: path has no drawable subpaths`);
  for (const s of subs) {
    if (!s.closed) throw new ContractViolation(`Cutout #${index + 1}: every subpath must be closed with Z`);
    if (s.ring.length < 3) throw new ContractViolation(`Cutout #${index + 1}: degenerate subpath (fewer than 3 points)`);
  }
  const rings = subs.map((s) => s.ring);
  const areas = rings.map(ringArea);
  // הכיוון הדומיננטי = של הטבעת הגדולה ביותר
  let maxIdx = 0;
  for (let i = 1; i < areas.length; i++) if (Math.abs(areas[i]) > Math.abs(areas[maxIdx])) maxIdx = i;
  const dominantSign = Math.sign(areas[maxIdx]) || 1;
  const solids: Ring[] = [];
  const reversed: Ring[] = [];
  for (let i = 0; i < rings.length; i++) {
    if (Math.abs(areas[i]) < 1e-6) continue;
    if (Math.sign(areas[i]) === dominantSign) solids.push(rings[i]);
    else reversed.push(rings[i]);
  }
  if (solids.length === 0) throw new ContractViolation(`Cutout #${index + 1}: path encloses no area`);
  let solidMp: MultiPolygon = union(...solids.map((r) => [[r]] as MultiPolygon));
  if (reversed.length === 0) return solidMp;

  // כיוון ליפוף הפוך אינו מספיק כדי להכריז על חור. חור הוא טבעת שיושבת **בתוך**
  // חומר; טבעת הפוכה שאינה בתוך שום חומר היא צורה נפרדת — שתי צורות מנוגדות
  // כיוון בנתיב אחד הן SVG חוקי לגמרי. עד כאן היא סווגה כחור, ו-`difference`
  // מול חומר זר לה פשוט לא עשה כלום: הצורה נעלמה בשקט מהגאומטריה שנחתכת.
  //
  // ההכרעה בשטח ולא בנקודה: מרכז המסה של טבעת קעורה יכול ליפול מחוצה לה, ואילו
  // חיתוך מול החומר עונה על "כמה ממני יושב בתוכו". חור אמיתי מכוסה כולו (יחס
  // ~1) וצורה נפרדת אינה מכוסה כלל (0), כך שהחצי הוא סף רחב ולא כיול עדין.
  //
  // הצינור החי לא מגיע לכאן — `core/svg_builder.py` מפעיל `orient` מפורש ופולט
  // מעטפת+חורים בכיוונים חד-משמעיים. זה מסלול הייבוא: SVG שלא אנחנו ייצרנו.
  const holes: Ring[] = [];
  const separate: Ring[] = [];
  for (const ring of reversed) {
    const own = Math.abs(ringArea(ring));
    const covered = multiPolygonArea(intersection(solidMp, [[ring]] as MultiPolygon));
    (covered >= own * 0.5 ? holes : separate).push(ring);
  }
  if (separate.length > 0) {
    solidMp = union(solidMp, ...separate.map((r) => [[r]] as MultiPolygon));
  }
  if (holes.length === 0) return solidMp;
  const holeMp: MultiPolygon = union(...holes.map((r) => [[r]] as MultiPolygon));
  return difference(solidMp, holeMp);
}

const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

export function polygonToPathD(poly: Polygon): string {
  return poly.map((ring) => ringToPathD(ring)).join("");
}

/** פקודות עקומה. הן חוקיות ב-SVG ואינן חוקיות במסגור — ראה `normalizeSvg`. */
const CURVE_CMD = /[CcSsQqTtAa]/;

/**
 * הנרמול המלא. rawSvg — פלט ה-LLM (אחרי המרת text-request אם היו).
 * זורק ContractViolation על כל סטייה מהחוזה.
 */
export function normalizeSvg(rawSvg: string, lengthMm: number, widthMm: number): NormalizedDesign {
  const cleaned = rawSvg
    .replace(/```(?:svg|xml)?/g, "")
    .trim();
  const root = parseXml(cleaned);
  const ds = extractCutoutPaths(root, lengthMm, widthMm);

  // חיתוך כל cutout לתוך מלבן הרצועה במקום לדחות "מחוץ לגבול" — כך חיתוך שחוצה
  // את הקצה פשוט מסיר חומר בקצה ונוצר קצה גלי (מבוקש). חיתוך מחוץ לגמרי נושר.
  const strip: MultiPolygon = [rectPolygon(0, 0, lengthMm, widthMm)];
  const rawCutouts = ds.map((d, i) => pathToPolygons(d, i));
  let wasClipped = false;
  const cutouts: MultiPolygon[] = [];
  for (const mp of rawCutouts) {
    const clipped = intersection(mp, strip);
    if (Math.abs(multiPolygonArea(clipped) - multiPolygonArea(mp)) > 1e-3) wasClipped = true;
    if (multiPolygonArea(clipped) > 1e-9) cutouts.push(clipped);
  }

  const cutUnion = union(...cutouts);

  // זיהוי חפיפות: אם סכום השטחים שונה משטח האיחוד — יש חפיפה. אם היה חיתוך לגבול
  // או חפיפה — פולטים את האיחוד כפוליגונים דגומים; אחרת שומרים את ה-d המקוריים.
  const sumArea = cutouts.reduce((s, c) => s + multiPolygonArea(c), 0);
  const unionArea = multiPolygonArea(cutUnion);
  const overlapping = Math.abs(sumArea - unionArea) > 1e-3;

  let pathEls: string[];
  let outCutouts: MultiPolygon[];
  if (overlapping || wasClipped) {
    pathEls = cutUnion.map((poly) => `<path d="${polygonToPathD(poly)}" fill="black"/>`);
    outCutouts = cutUnion.map((poly) => [poly]);
  } else {
    // ה-`d` המקורי נשמר — אבל רק כשהוא כבר בפורמט שהמסגור יודע לקרוא.
    //
    // `normalizeD` מעגל מספרים ולא נוגע בפקודות, ואילו `rescaleCutoutsSvg`
    // (frame.ts) **זורק** על כל מה שאינו M/L/Z. שני חצאים של אותה מערכת חלוקים
    // על מה נחשב "קנוני", והמחיר משולם מאוחר ורחוק: נתיב עם עקומה נשמר בשקט
    // כגרסה, ואז מפיל את הקריאה כולה ברגע שהגרסה חוזרת למסגור — עריכה, או
    // אימוץ של שיתוף.
    //
    // מי שנושא עקומה נפלט כפוליגונים הדגומים שלו — בדיוק אלה שהוולידציה מדדה,
    // כך שמה שנשמר הוא מה שנבדק. `rawCutouts` ולא `cutouts` כי הוא מיושר
    // לאינדקס של `ds` (השני מדלג על שטח אפסי).
    //
    // הווקטורייזר שלנו פולט M/L/Z בלבד (`core/svg_builder.py`), ולכן בצינור
    // החי השורה הזו לא משנה דבר — היא מכסה SVG שלא אנחנו ייצרנו.
    pathEls = ds.map(
      (d, i) =>
        `<path d="${CURVE_CMD.test(d) ? rawCutouts[i].map(polygonToPathD).join("") : normalizeD(d)}" fill="black"/>`,
    );
    outCutouts = cutouts;
  }

  const canonicalSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(lengthMm)} ${fmt(widthMm)}">` +
    `<g id="cutouts">${pathEls.join("")}</g></svg>`;

  return { canonicalSvg, lengthMm, widthMm, cutouts: outCutouts, cutUnion };
}

/**
 * הסף שמתחתיו פתח נחשב לא-קיים אחרי הכיווץ.
 *
 * מספר אחד לשני הצדדים, ובכוונה מיוצא: הניקוי כאן ובדיקת V5 הריצו שני ספים
 * (`> 1e-9` מול `< 1e-4`) על אותו predicate, ולכן הניקוי השאיר בדיוק את מה
 * ש-V5 פסל — פתח בשטח הביניים עבר את המנקה ואז הפיל את הוולידציה.
 *
 * זהו הסף של **פתח שלם** שקטן מדי. מה שמבדיל חלק דק *בתוך* פתח תקין הוא
 * `drawnArea`, וזו שאלה אחרת: לא "האם נשאר משהו" אלא "האם מה שאבד היה שם".
 */
export const OPENING_AREA_EPS = 1e-4;

/**
 * האם את הפתח הזה אפשר לחתוך: נשאר לו שטח אחרי כיווץ בחצי מהמינימום מכל צד.
 *
 * **פר-פוליגון ולא פר-קבוצה.** cutout אחד יכול לשאת כמה פוליגונים, וכיווץ של
 * הקבוצה כולה מסתיר שערה בודדת בתוך שכנים בריאים. V5 מודד פוליגון-פוליגון,
 * ולכן גם המנקה — אחרת הוא "מנקה" ומשאיר בדיוק את מה שייפסל.
 */
export function isCuttableOpening(poly: Polygon, minHoleMm: number): boolean {
  return multiPolygonArea(offset([poly], -minHoleMm / 2)) >= OPENING_AREA_EPS;
}

/**
 * החלקים של פתח שאי אפשר לחתוך — ריק כשאין כאלה.
 *
 * **למה זה לא predicate.** `isCuttableOpening` שואל על הפוליגון כולו, וזה תופס
 * שערה ש**שוכבת ליד** פתח. שערה ש**יוצאת מתוך** פתח היא חלק מהפוליגון שלו,
 * הפוליגון רחב לגמרי, והשאלה נענית "כן" עם הזרוע מחוברת.
 *
 * נמדד על AP-0165 (14.8): שישה פתחים, אף אחד לא דק כשלם, ולכל אחד זרועות חוט
 * שיוצאות מהקצוות. המנקה השאיר את כולן, V5 שואל את אותה שאלה באותה צורה וכתב
 * "All cutouts ≥ 0.5mm", ואז V4 — שמודד רוחב על החומר — הפיל את שלושת
 * המועמדים על הצווארים שהזרועות צבטו. הלקוח קיבל עיצוב אחד במקום שלושה.
 *
 * הכיווץ הופך למדידה חלק-אחר-חלק: מכווצים בחצי המינימום, מרחיבים חזרה, ומה
 * שאבד בדרך צר מהמינימום — בין אם הוא עומד לבד ובין אם הוא תלוי במשהו רחב.
 *
 * **ומה שמוחזר הוא רק מה שצויר.** כיווץ-והרחבה מגלח גם פינה קמורה חדה מרדיוס
 * הכיווץ, לכל היותר `r²(1−π/4)` ≈ 0.054·min² לפינה, והחזרת אלה הייתה משכתבת
 * את המתאר של כל עיצוב נקי בקטלוג בתמורה לכלום. `drawnArea` יושב סדר גודל
 * מעל פינה בודדת ושניים מתחת לשערה ששווה להסיר — ולכן עיצוב שאין בו כזו חוזר
 * זהה, פינה בפינה, ו-`dropThinCutouts` מחזיר את אותו אובייקט.
 */
export function uncuttableParts(poly: Polygon, minHoleMm: number): MultiPolygon {
  // הפתח כולו קטן מהמינימום — המקרה שה-predicate טיפל בו, ובאותו סף בדיוק,
  // כדי ש-V5 והמנקה ימשיכו להסכים עליו מילה במילה.
  if (!isCuttableOpening(poly, minHoleMm)) return [poly];
  const r = minHoleMm / 2;
  // **שתי הפעולות האלה הן זוג שחולק מתאר.** הפתיחה כולה `offset`, כלומר היא
  // כבר יושבת על רשת של 0.001 מ"מ; `poly` הוא צף גולמי מדגימת הקשתות. כל אחת
  // מהן מעמידה זה מול זה שני עותקים של אותו מתאר שנבדלים רק בשארית העיגול —
  // ובדיוק על זה polygon-clipping זורק `Unable to complete output ring`
  // (ובקינון עמוק, `Maximum call stack size exceeded`). נמדד: 135 כשלים מתוך
  // 612 עיצובים של עיגולים חופפים, **כולם** בשתי השורות האלה. ראה `safely`.
  const opened = intersectionSafe(offset(offset([poly], -r), r), [poly]);
  if (opened.length === 0) return [poly];
  return differenceSafe([poly], opened).filter((p) => polygonArea(p) >= drawnArea(minHoleMm));
}

/** מתחת לזה, חלק דק הוא העיגול של הכיווץ עצמו ולא משהו שצויר. ראה
 *  `uncuttableParts`. */
const drawnArea = (minHoleMm: number): number => (minHoleMm * minHoleMm) / 2;

/**
 * מסיר מכל cutout את מה שאי אפשר לחתוך — פתח שלם שקטן מדי, וגם חלק דק מדי
 * בתוך פתח שאחרת תקין (`uncuttableParts`).
 *
 * הווקטורייזר מסנן את אותו דבר בקופסה, אבל לא כל SVG מגיע משם: גרסאות שנשמרו
 * לפני הסינון עדיין נושאות שערות של 0.17–0.3 מ"מ ונפסלות, וכל עריכה שלהן
 * עוברת כאן. כך עיצוב קיים מתנקה כשהוא עובר במסלול, בלי יצירה מחדש — וכך גם
 * התיקון של AP-0165 חל מיד עם פריסת האפליקציה, בלי להמתין לפריסת הקופסה.
 *
 * **היחס ל-V5 השתנה, ולטובה.** קודם שניהם שאלו בדיוק את אותה שאלה, כי מנקה
 * חלש יותר מהבדיקה משאיר בשקט את מה שהיא פוסלת. עכשיו המנקה מסיר **על-קבוצה**
 * של מה ש-V5 פוסל, וזה הכיוון הבטוח: אין גאומטריה שהמנקה משאיר ו-V5 נופל
 * עליה. V5 עצמו לא זז — הוא שער שנקרא ומדווח, ואי אפשר להחמיר אותו בלי לסכן
 * פסילה שקרית של כל פתח מעוגל בקטלוג.
 *
 * מחזיר את אותו אובייקט כשאין מה להסיר, כדי שהמסלול הנפוץ לא ישלם על בנייה
 * מחדש של ה-SVG ולא ישנה את ה-d המקורי לחינם.
 */
/**
 * האם הפוליגון נוגע במסגרת הפס — כלומר הוא הרקע שסביב הצללית, ולא פתח סגור.
 *
 * `minHole` קיים כי הלייזר אינו יכול **לפתוח חור** קטן ממנו. אזור שנוגע
 * במסגרת אינו חור — הלייזר פשוט עוקב אחרי קו המתאר — ומדידת החלקים הדקים שלו
 * ממלאת במתכת כל מרווח תת-מינימלי לאורך קצה רועש, כלומר מרתכת את הפרנזים של
 * המעקב לעור מוצק על המתאר (AP-0170, 14.8: קצה מוצלל חזר כגבשושיות מלאות
 * וקווים משיקים ישרים; נמדד ‎+5.8 ממ"ר מתכת על קצה מפורנז, 0 עם השער).
 *
 * הסבילות רחבה מהצורך: קואורדינטות קנוניות יושבות על המסגרת במדויק, ופתח
 * אמיתי במרחק 0.1 מ"מ מהקצה ממילא אינו חוקי ייצורית.
 */
const touchesFrame = (poly: Polygon, lengthMm: number, widthMm: number, eps = 0.1): boolean => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly[0]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return minX <= eps || minY <= eps || maxX >= lengthMm - eps || maxY >= widthMm - eps;
};

export function dropThinCutouts(n: NormalizedDesign, minHoleMm: number): NormalizedDesign {
  if (minHoleMm <= 0) return n;
  let changed = false;
  const kept = n.cutouts
    .map((mp) =>
      mp.flatMap((poly) => {
        // אזור שנוגע במסגרת מקבל את הסמנטיקה שתמיד הייתה לו: נשמר שלם, ונופל
        // רק כשהוא כולו בלתי-ניתן-לחיתוך. המדידה חלק-אחר-חלק היא לפתחים
        // סגורים בלבד — ראה `touchesFrame`.
        if (touchesFrame(poly, n.lengthMm, n.widthMm)) {
          if (isCuttableOpening(poly, minHoleMm)) return [poly];
          changed = true;
          return [];
        }
        const drop = uncuttableParts(poly, minHoleMm);
        if (drop.length === 0) return [poly];
        changed = true;
        // מה שנשאר יכול להתפרק: הסרה של זרוע מותירה לפעמים גדם כפוליגון בפני
        // עצמו, וגדם עומד לבדו הוא בדיוק מה שהבדיקה הראשונה פוסלת. בלי המסננת
        // הזו המנקה היה מחליף כשל V4 בכשל V5 — נמדד על AP-0165.
        //
        // גם כאן זוג שחולק מתאר: `drop` יצא מ-`uncuttableParts`, ולכן מתארו
        // חופף את `poly` לאורך כל מה שלא הוסר. אותם אופרנדים בדיוק שהפילו את
        // השורה שם.
        return differenceSafe([poly], drop).filter((p) => isCuttableOpening(p, minHoleMm));
      }),
    )
    .filter((mp) => mp.length > 0);
  if (!changed) return n;

  const cutUnion = union(...kept);
  const pathEls = kept.flatMap((mp) => mp.map((poly) => `<path d="${polygonToPathD(poly)}" fill="black"/>`));
  return {
    canonicalSvg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(n.lengthMm)} ${fmt(n.widthMm)}">` +
      `<g id="cutouts">${pathEls.join("")}</g></svg>`,
    lengthMm: n.lengthMm,
    widthMm: n.widthMm,
    cutouts: kept,
    cutUnion,
  };
}

/**
 * מסיר חתיכות מתכת שאינן מחוברות לגוף — הפגם שמייצר גם V2 וגם V3.
 *
 * "אי" הוא חומר שמוקף כולו בחיתוכים, כלומר רכיב נפרד של המתכת. הוא נושר
 * בחיתוך ומשאיר חור שאיש לא תכנן, ולכן עיצוב כזה פשוט אינו ניתן לייצור.
 * המחיקה היא פעולה גיאומטרית טהורה — משאירים את הרכיב הגדול, וכל השאר הופך
 * לחיתוך — ולכן היא מיידית, דטרמיניסטית, ולא דורשת סבב נוסף מול המודל.
 *
 * **למה מחיקה ולא גשר.** גישור מוסיף פס מתכת שאיש לא צייר: הוא חוצה חיתוך,
 * נראה כמו טעות, והבחירה איפה למקם אותו היא החלטה עיצובית שאין לנו בסיס
 * לקבל. הלקוחה לא ראתה את הגרסה ה"מקורית" ולכן אינה יכולה להתגעגע לשבב שהוסר,
 * אבל היא בהחלט תראה קו שהופיע משום מקום.
 *
 * **הסף.** מחיקה גדולה אינה תיקון אלא עיצוב אחר, ולכן מעל `maxDroppedFraction`
 * מהחומר לא נוגעים — עדיף להחזיר עיצוב שנכשל בוולידציה מאשר להחזיר בשקט משהו
 * אחר ממה שהמודל ייצר. במדידה על AP-0060 האי היה 67.6 מ"מ² = 1.95% מהחומר,
 * כלומר המקרה האמיתי רחוק מהסף בסדר גודל.
 *
 * מחזיר את אותו אובייקט כשאין מה להסיר, כמו `dropThinCutouts`.
 */
export function dropDetachedMaterial(
  n: NormalizedDesign,
  maxDroppedFraction: number,
): NormalizedDesign {
  const strip: MultiPolygon = [rectPolygon(0, 0, n.lengthMm, n.widthMm)];
  const material = difference(strip, n.cutUnion);
  if (material.length <= 1) return n;

  const areas = material.map(polygonArea);
  const total = areas.reduce((a, b) => a + b, 0);
  if (total <= 0) return n;
  let keep = 0;
  for (let i = 1; i < areas.length; i++) if (areas[i] > areas[keep]) keep = i;
  if ((total - areas[keep]) / total > maxDroppedFraction) return n;

  // ה-cutouts נבנים מחדש מהמשלים של החומר שנשאר: האי היה חור *בתוך* חיתוך,
  // ומחיקתו מאחדת אותו עם החיתוך שהקיף אותו. לכן זו אינה סינון של הרשימה
  // הקיימת (כמו ב-dropThinCutouts) אלא גזירה מחדש.
  const cutUnion = difference(strip, [material[keep]]);
  const cutouts = cutUnion.map((poly) => [poly]);
  const pathEls = cutUnion.map((poly) => `<path d="${polygonToPathD(poly)}" fill="black"/>`);
  return {
    canonicalSvg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(n.lengthMm)} ${fmt(n.widthMm)}">` +
      `<g id="cutouts">${pathEls.join("")}</g></svg>`,
    lengthMm: n.lengthMm,
    widthMm: n.widthMm,
    cutouts,
    cutUnion,
  };
}

/** ניקוי קל של d מקורי: עיגול מספרים ל-3 ספרות, שמירת פקודות ועקומות */
function normalizeD(d: string): string {
  return d
    .replace(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g, (s) => fmt(parseFloat(s)))
    .replace(/\s+/g, " ")
    .replace(/"/g, "")
    .trim();
}
