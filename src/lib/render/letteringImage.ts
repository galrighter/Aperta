import { BASE_CANVAS } from "./baseImage";
import { textToStencil, measureText, polygonsBBox, translatePolygons } from "@/lib/text/stencil";
import { stylesForBrief, type LetteringStyle } from "@/lib/text/style";
import { offset, multiPolygonArea } from "@/lib/geometry/poly";
import { ringToPathD } from "@/lib/geometry/paths";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import type { MultiPolygon } from "@/lib/geometry/types";

// תמונת הייחוס של הכיתוב.
//
// **הרעיון:** לא לתת למודל התמונה להמציא את האותיות. כשהוא כותב לפי בקשה
// בטקסט הוא בולע יו״ד, מחליף מ׳ ב-ם׳ ומתקן כתיב בשקט (`appologize` חזר
// `APOLOGIZE` בכל הרצה), ואיות תו-אחר-תו בפרומפט רק הרע את המצב. לכן הכיתוב
// נחתך כאן, מהפונט שלנו, ונמסר לו כתמונת ייחוס ל-`images/edits` — יש לו מה
// להעתיק במקום מה לנחש. המדידות: docs/research/HEBREW_TEXT_HANDOFF.md.
//
// **מה שהוא מחזיר הוא מה שנחתך.** היה שלב שהחליף את האותיות שהמודל צייר
// בנתיבי הפונט המקוריים, והוסר (31/07): מול הייחוס המתוקן המודל מדייק ב-3
// מתוך 4 חלופות, והלקוחה בוחרת ומאשרת בעצמה. הכיתוב שהיא רואה הוא הכיתוב
// שייחתך, וההוראה לוודא איות יושבת בשדה עצמו. ראה §6.8 במסמך המימוש.
//
// **פולריות:** האותיות הן **פתחים** בפס, לא מתכת. זה הממצא המרכזי של המחקר.
// אות כמתכת פירושה שכל יו״ד היא אי מנותק שנופל בחיתוך, ושלוש נוסחאות שונות
// של "חבר את האותיות" לא הצליחו לגרום למודל לחבר את הקטנות. כפתח הבעיה לא
// נפתרת אלא מפסיקה להתקיים — חור לא נופל. מה שנשאר הוא החלל הסגור של ם/ס,
// ואותו סוגר הגישור האוטומטי של stencil.ts.
//
// הצורה נבנית בדיוק כמו ב-baseImage.ts, ולא במקרה: הקופסה כבר מרסטרת
// `base_svg` ומעבירה ל-`images/edits` (vectorizer/app/generate.py:_reference).
// תמונת הייחוס של הכיתוב היא אותו מנגנון עם מקור אחר לחיתוכים.

/** כמה מרוחב הקנבס הפס תופס — כמו ב-baseImage. */
const FILL = 0.9;

/** כמה מגובה השורה הפס תופס. תואם ל-ROW_FILL ב-render/panels.ts. */
const ROW_FILL = 0.5;

/** שוליים בכל קצה של הפס, כשבריר מהאורך. הכיתוב לא נוגע בקצוות. */
const SIDE_MARGIN = 0.08;

/**
 * גובה האות הקטן ביותר שעדיין מייצר כיתוב קריא אחרי ווקטוריזציה. מתחת לזה
 * הקווים הדקים של האות נסגרים בהחלקה — כלומר הכיתוב שהובטח ללקוחה לא ייחתך.
 * עדיף להגיד לה שהטקסט ארוך מדי מאשר לחתוך משהו שלא קריא.
 */
const MIN_LETTER_MM = 3;

/** התקרה לגובה האות כשבריר מרוחב הפס. משאירה שוליים כדי שהאות לא תיגע בקצה. */
const MAX_HEIGHT_RATIO = 0.7;

/** גובה המדידה. הכל ליניארי בו, ולכן די בבדיקה אחת לכל שורה. */
const PROBE_MM = 10;

export interface LetteringRow {
  fontId: LetteringStyle["fontId"];
  /** גובה הדיו בפועל אחרי ההתאמה לפס, במ"מ. */
  letterHeightMm: number;
  /** רוחב הכיתוב במ"מ. */
  textWidthMm: number;
  /** הנתח (0..1) שהגשר תופס מהחלל הסגור, כשהמינימום לאות הוא שקבע אותו.
   *  `null` = לכל האותיות בשורה היה מקום. זה מה שמצדיק את בקשת האישור. */
  tightShare?: number | null;
  /** האותיות עצמן, בקואורדינטות הפס. גאומטריה ולא דיווח — **לא** לכתוב
   *  אותן ליומן; ראה מה שנכתב שם ב-route.ts. */
  glyphs: MultiPolygon;
}

export interface LetteringReference {
  svg: string;
  /** מה שנחתך בכל שורה — נשמר ליומן כדי שאפשר יהיה להסביר תוצאה. */
  rows: LetteringRow[];
  /**
   * הנתח הגדול ביותר שגשר תופס מחלל סגור, מכל השורות שהוצעו. `null` = הכיתוב
   * כולו נחתך בלי לפגוע באות. הקורא אחראי להעביר את זה ללקוחה לאישור — ראה
   * `LETTERING_BRIDGE` ב-/api/generate.
   */
  tightShare: number | null;
}

export interface LetteringDims {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * כל אות חייבת לשרוד את הכלל שהיא נכפפת אליו ממילא: פתח צר מ-minHole נמחק
 * בקופסה (`drop_thin_cutouts`) ונופל ב-V5. אות שנחתכה דקה מדי לא יוצאת דקה —
 * היא **לא יוצאת**, והלקוחה מקבלת תכשיט בלי הכיתוב שהובטח לה.
 *
 * הבדיקה היא אותה שחיקה שהוולידציה עושה, ולא יחס גזע ששמור לכל פנים: היחס
 * תלוי באילו אותיות נכתבו בפועל — ן׳ ב-Amatic דקה פי שלושה מ-א׳ באותו פונט —
 * ולכן מספר קבוע לפנים היה פוסל שמות שלמים שאין בהם שום בעיה.
 *
 * הנמדד הוא **שטח** ולא ספירת חלקים. פנים סריפיות מייצרות זיזים דקיקים שאכן
 * ייעלמו בחיתוך, ואיבודם לא פוגע בקריאוּת בכלום; מה שאסור הוא שהאותיות עצמן
 * ייעלמו. הסף מפריד בדיוק בין השניים — Frank Ruhl מאבד סריפים ועובר, Amatic
 * SC מאבד את כל הכיתוב ונפסל.
 */
const LOSS_LIMIT = 0.05;

function survivesCutting(mp: MultiPolygon, minHole: number): boolean {
  let total = 0;
  let lost = 0;
  for (const poly of mp) {
    const area = multiPolygonArea([poly]);
    total += area;
    if (multiPolygonArea(offset([poly], -minHole / 2)) <= 1e-6) lost += area;
  }
  return total > 0 && lost / total <= LOSS_LIMIT;
}

/**
 * הכיתוב כפוליגונים, ממורכז על פס באורך/רוחב הנתונים.
 *
 * הגובה נגזר משלושה אילוצים: הרוחב שהסגנון מבקש, האורך הפנוי, ומה שאפשר
 * לחתוך. `null` פירושו שאין גובה שמספק את שלושתם — מקרה שהקורא חייב להציג
 * ללקוחה, לא לבלוע.
 */
async function letteringPolygons(
  text: string,
  dims: LetteringDims,
  productType: "bracelet" | "ring",
  style: LetteringStyle,
): Promise<{ mp: MultiPolygon; row: LetteringRow } | null> {
  const available = dims.lengthMm * (1 - 2 * SIDE_MARGIN);
  const probe = await measureText(text, PROBE_MM, style);
  if (!(probe.inkHeightMm > 0) || !(probe.widthMm > 0)) return null;

  const fab = resolveFab(dims.thicknessMm, productType);
  /** הגובה (הארגומנט ל-textToPolygons) שנותן גובה דיו נתון. */
  const sizeFor = (inkMm: number) => (PROBE_MM * inkMm) / probe.inkHeightMm;
  /** ...ואם בגובה הזה הכיתוב חורג מהאורך הפנוי, האורך גובר. */
  const fit = (size: number) => {
    const w = (probe.widthMm * size) / PROBE_MM;
    return w > available ? (size * available) / w : size;
  };

  // שני מועמדים: מה שהסגנון ביקש, ואם הוא יוצא דק מדי לחיתוך — הגדול ביותר
  // שהפס בכלל מרשה. הסגנון הוא העדפה; מה שאפשר לחתוך הוא לא.
  const wanted = fit(sizeFor(dims.widthMm * style.heightRatio));
  const largest = fit(sizeFor(dims.widthMm * MAX_HEIGHT_RATIO));
  const sizes = largest > wanted ? [wanted, largest] : [wanted];

  for (const size of sizes) {
    if ((probe.inkHeightMm * size) / PROBE_MM < MIN_LETTER_MM) continue;
    const cut = await textToStencil(
      text, 0, 0, size, "start", fab.minBridgeCut, style, FAB.minLetterBridgeMm,
    );
    const raw = cut.polygons;
    if (raw.length === 0 || !survivesCutting(raw, fab.minHole)) continue;
    // הנתח הגדול ביותר שגשר תופס מחלל סגור, כשהרצפה היא שקבעה אותו. זה המספר
    // שאומר כמה האות נפגעה — רוחב לבדו לא אומר כלום בלי החלל שהוא נכנס אליו.
    const tightShare = cut.tightBridges.length
      ? Math.max(...cut.tightBridges.map((b) => b.widthMm / b.counterMm))
      : null;

    // מירכוז נמדד ולא מחושב: הגישור חותך מהאותיות, ותיבת המידה שאחריו היא
    // הצורה שבאמת נחתכת. מירכוז לפי מטריקות הפונט היה מזיז את הכיתוב ממרכז הפס.
    const [x0, y0, x1, y1] = polygonsBBox(raw);
    const mp = translatePolygons(raw, dims.lengthMm / 2 - (x0 + x1) / 2, dims.widthMm / 2 - (y0 + y1) / 2);
    return {
      mp,
      row: {
        fontId: style.fontId,
        letterHeightMm: r2(y1 - y0),
        textWidthMm: r2(x1 - x0),
        tightShare: tightShare === null ? null : Math.round(tightShare * 100) / 100,
        glyphs: mp,
      },
    };
  }
  return null;
}

/**
 * תמונת הייחוס: `rows` פסים שחורים על קנבס לבן, בכל אחד אותו כיתוב בפנים
 * אחרות. הקופסה חותכת את התמונה לאותן שורות (render/panels.ts), ולכן כל שורה
 * חוזרת ללקוחה כחלופה נפרדת — מגוון טיפוגרפי בקריאה אחת למודל.
 *
 * `null` = הטקסט לא נכנס לפס בשום פנים. הקורא אחראי להגיד את זה ללקוחה.
 */
export async function buildLetteringRenderSvg(
  text: string,
  dims: LetteringDims,
  productType: "bracelet" | "ring",
  rows: number,
  brief: string,
): Promise<LetteringReference | null> {
  const content = text.trim();
  if (!content) return null;

  // הסדר הוא סדר ההעדפה: מה שהבריף ביקש, ואחריו משלימים מרוחקים ממנו באופי.
  // כולן נבדקות ולא רק ה-`rows` הראשונות, כי פנים עשויות ליפול על הפס הזה —
  // כיתוב ארוך על טבעת, למשל, נכנס בפנים צרות ולא ברחבות. עדיף לתת ללקוחה
  // טיפוגרפיה שנייה בבחירה מאשר להגיד לה שהטקסט לא נכנס כשהוא כן.
  const ordered = stylesForBrief(brief);
  const drawnAll = await Promise.all(
    ordered.map((style) => letteringPolygons(content, dims, productType, style)),
  );
  const cuts = drawnAll.filter((d): d is NonNullable<typeof d> => d !== null).slice(0, rows);
  if (cuts.length === 0) return null;

  const { widthPx: cw, heightPx: ch } = BASE_CANVAS;
  const bandH = ch / cuts.length;
  const scale = Math.min((cw * FILL) / dims.lengthMm, (bandH * ROW_FILL) / dims.widthMm);
  const l = r2(dims.lengthMm);
  const w = r2(dims.widthMm);
  const x = (cw - dims.lengthMm * scale) / 2;

  const bands = cuts.map((cut, i) => {
    const y = i * bandH + (bandH - dims.widthMm * scale) / 2;
    const paths = cut.mp
      .map((poly) => `<path d="${poly.map((r) => ringToPathD(r)).join("")}" fill="#000000"/>`)
      .join("");
    return (
      `<defs><mask id="lt${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${l}" height="${w}">` +
      `<rect width="${l}" height="${w}" fill="#ffffff"/>${paths}</mask></defs>` +
      `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r6(scale)})">` +
      `<rect width="${l}" height="${w}" rx="${r2(Math.min(dims.widthMm / 6, 2))}" fill="#111111" mask="url(#lt${i})"/>` +
      `</g>`
    );
  });

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">` +
      `<rect width="${cw}" height="${ch}" fill="#ffffff"/>${bands.join("")}</svg>`,
    rows: cuts.map((c) => c.row),
    tightShare: (() => {
      const tight = cuts
        .map((c) => c.row.tightShare)
        .filter((v): v is number => typeof v === "number");
      return tight.length ? Math.max(...tight) : null;
    })(),
  };
}
