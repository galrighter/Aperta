// מודל מסע היצירה — טיפוסים, תמחור, המרות גאומטריה ובניית הפרומפט למנוע.
// מקור: handoff_design_flow/HANDOFF.md
import type { MultiPolygon, ValidationReport } from "@/lib/geometry/types";
import { he } from "@/i18n/he";
import { svgFrame } from "@/lib/geometry/frame";
import { priceFor, type Price } from "@/lib/pricing";

const d = he.design;

export type Product = "bracelet" | "ring";
export type Fit = "tight" | "regular" | "loose";
export type Symmetry = "symmetric" | "asymmetric";
export type Density = "low" | "medium" | "high";
export type Feel = "delicate" | "balanced" | "massive";
export type ImageRole = "inspiration" | "sketch" | "ready";
export type Region = "right" | "center" | "left" | "all";
export type ResultMode = "render" | "flat";

export type Screen =
  | "product" | "sizes" | "brief" | "processing"
  | "result" | "summary" | "checkout" | "done";

/** ששת השלבים בסרגל. "processing" אינו שלב עצמאי — הוא מוצג תחת "עיצוב". */
export const RAIL: Array<{ key: keyof typeof d.steps; screens: Screen[] }> = [
  { key: "product", screens: ["product"] },
  { key: "sizes", screens: ["sizes"] },
  { key: "brief", screens: ["brief", "processing"] },
  { key: "result", screens: ["result"] },
  { key: "summary", screens: ["summary"] },
  { key: "checkout", screens: ["checkout", "done"] },
];

/** טווחי רוחב לפי ה-handoff §2 (מיושרים גם ב-fabrication.config). */
export const WIDTH = {
  bracelet: { min: 5, max: 80, def: 18 },
  ring: { min: 4, max: 18, def: 6 },
} as const;

/** הפתח נגזר מסוג הישיבה — הלקוחה לא מזינה תוספת להיקף (handoff §3.3). */
export const FIT_GAP_MM: Record<Fit, number> = { tight: 18, regular: 25, loose: 33 };
export const RING_GAP_MM = 6;

export interface ImageFile {
  dataUrl: string;
  name: string;
}

export interface EditEntry {
  versionId: string;
  versionNo: number;
  /** האורך שהגרסה נשמרה בו. שווה למה שהוזמן — הדוגמה נמתחת אליו. נשמר
   *  כגיבוי בלבד: מסגרת התצוגה נקראת מה-viewBox של ה-SVG. */
  lengthMm: number | null;
  region: Region | null;
  text: string;
  svg: string;
  report: ValidationReport | null;
  geometry: { material: MultiPolygon } | null;
  /** ההצעות שחזרו באותה יצירה — הלקוחה יכולה לעבור ביניהן. */
  candidates?: Array<{ svg: string; report: ValidationReport }>;
  /**
   * איזו הצעה מוצגת כרגע. נשמר כאינדקס ולא מושווה לפי ה-SVG: מה שנשמר כגרסה
   * הוא ה-canonicalSvg שהשרת מייצר, ולא המחרוזת שההצעה נשאה, ולכן השוואת
   * מחרוזות לא מזהה אף הצעה — הסימון "מוצג כעת" לא הופיע על אף אחת, והשמירה
   * מפני בחירה חוזרת של אותה הצעה לא פעלה.
   */
  chosen?: number;
}

export interface Addr {
  name: string; street: string; city: string;
  zip: string; phone: string; email: string;
}

export interface CreateState {
  screen: Screen;
  product: Product | null;

  // מידות
  wristPreset: string;
  circ: string;
  fit: Fit;
  braceletWidth: number;
  ringPreset: string;
  ringSize: string;
  ringWidth: number;
  guideOpen: boolean;

  // עיצוב
  symmetry: Symmetry;
  density: Density;
  feel: Feel;
  image: ImageFile | null;
  imageRole: ImageRole | null;
  brief: string;

  // מנוע
  designId: string | null;
  /** המספר הסידורי של העיצוב, כפי שהוקצה במסד. הרפרנס האנושי אליו. */
  designSerial: number | null;
  edits: EditEntry[];
  activeEdit: number;
  procError: string | null;
  /** מזהה טכני של הכשל (code · status) — לאבחון מצילום מסך. */
  procErrorDetail: string | null;
  /** כשל במעבר בין הצעות. procError מוצג רק במסך העיבוד, ולכן לא היה למי
   *  לספר שהלחיצה נכשלה — היא פשוט לא עשתה כלום. */
  chooseError: string | null;
  applying: boolean;

  // תוצאה
  resultMode: ResultMode;
  region: Region | null;
  editReq: string;
  cutDensity: number;
  bridgeMm: number;

  // סיכום ותשלום
  terms: boolean;
  addr: Addr;
  sending: boolean;
  sendError: string | null;
  /** קישור `mailto:` עם ההזמנה המלאה, נבנה רק כשהשליחה נכשלה. בלעדיו הזמנה
   *  שנפלה על שגיאת רשת פשוט נעלמת: הלקוחה מילאה הכול, ראתה "נסו שוב", ואין
   *  לה — ולנו — שום עותק של מה שהיא ביקשה. */
  sendMailto: string | null;
  orderNo: string | null;
}

export const INITIAL: CreateState = {
  screen: "product",
  product: null,
  wristPreset: "medium",
  circ: "",
  fit: "regular",
  braceletWidth: WIDTH.bracelet.def,
  ringPreset: "medium",
  ringSize: "",
  ringWidth: WIDTH.ring.def,
  guideOpen: false,
  symmetry: "symmetric",
  density: "medium",
  feel: "balanced",
  image: null,
  imageRole: null,
  brief: "",
  designId: null,
  designSerial: null,
  edits: [],
  activeEdit: -1,
  procError: null,
  procErrorDetail: null,
  chooseError: null,
  applying: false,
  resultMode: "render",
  region: "all",
  editReq: "",
  cutDensity: 9,
  bridgeMm: 2,
  terms: false,
  addr: { name: "", street: "", city: "", zip: "", phone: "", email: "" },
  sending: false,
  sendError: null,
  sendMailto: null,
  orderNo: null,
};

/* ===== נגזרות מידה ===== */

export const widthOf = (s: CreateState): number =>
  s.product === "ring" ? s.ringWidth : s.braceletWidth;

/** ההיקף בפועל: קלט מדויק גובר על הכפתור הסטנדרטי (handoff §3.3). */
export function circumferenceMm(s: CreateState): number {
  if (s.product === "ring") {
    const exact = parseFloat(s.ringSize);
    // מידת טבעת (4–13) מומרת להיקף; מעל 30 — הוזן היקף במ"מ ישירות.
    if (!Number.isNaN(exact) && exact > 0) return exact > 30 ? exact : 44.8 + exact * 1.6;
    return d.ringPresets.find((p) => p.id === s.ringPreset)?.mm ?? 55;
  }
  const exact = parseFloat(s.circ);
  if (!Number.isNaN(exact) && exact > 0) return exact;
  return d.wristPresets.find((p) => p.id === s.wristPreset)?.mm ?? 165;
}

export const gapOf = (s: CreateState): number =>
  s.product === "ring" ? RING_GAP_MM : FIT_GAP_MM[s.fit];

/** אורך הרצועה השטוחה = היקף − פתח (הטבעת/הצמיד פתוחים). */
export function stripLengthMm(s: CreateState): number {
  const raw = circumferenceMm(s) - gapOf(s);
  const [lo, hi] = s.product === "ring" ? [30, 70] : [110, 200];
  return Math.round(Math.min(hi, Math.max(lo, raw)) * 10) / 10;
}

/** האם הוזנה מידה מדויקת (ולכן הכפתור הסטנדרטי מבוטל). */
export const hasExactSize = (s: CreateState): boolean => {
  const v = parseFloat(s.product === "ring" ? s.ringSize : s.circ);
  return !Number.isNaN(v) && v > 0;
};

/* ===== תמחור (handoff §7) ===== */

// החישוב עצמו עבר ל-`src/lib/pricing.ts`, כדי שהשרת יחשב את אותו מחיר ולא
// יקבל אותו מהדפדפן. כאן נשארה רק ההסבה ממצב המסך לקלט של הפונקציה.
export { PACKAGING, SHIPPING } from "@/lib/pricing";
export type { Price } from "@/lib/pricing";

export const priceOf = (s: CreateState): Price =>
  priceFor({ productType: s.product ?? "bracelet", widthMm: widthOf(s), density: s.density });

/* ===== גאומטריה ===== */

/** MultiPolygon → מחרוזת path אחת (fill-rule evenodd מייצר את החורים). */
export function mpToPath(mp: MultiPolygon | null | undefined): string {
  if (!mp?.length) return "";
  const parts: string[] = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      parts.push(
        "M" + ring.map(([x, y]) => `${round(x)},${round(y)}`).join("L") + "Z",
      );
    }
  }
  return parts.join(" ");
}

const round = (n: number) => Math.round(n * 100) / 100;

/** תוכן שכבת ה-cutouts מתוך ה-SVG הקנוני — מקור האמת לציור.
 *  ה-SVG תמיד קיים על הגרסה; geometry עשוי לחזור ריק. */
export function cutoutsInner(svg: string | null | undefined): string {
  if (!svg) return "";
  return /<g id="cutouts"[^>]*>([\s\S]*?)<\/g>/.exec(svg)?.[1] ?? "";
}

/** מסגרת התצוגה. מקור האמת הוא ה-viewBox של הגרסה עצמה — שם יושבות המידות
 *  שנחתכות בפועל. האורך שווה למה שהוזמן; הרוחב עשוי להיבדל ממנו עד כדי
 *  הסטייה שנבלעה במתיחה, ולכן אסור לקחת אותו מהטופס כשקיימת גרסה. */
export const frameLengthMm = (s: CreateState, e: EditEntry | null): number =>
  svgFrame(e?.svg)?.lengthMm ?? (e?.lengthMm && e.lengthMm > 0 ? e.lengthMm : stripLengthMm(s));

export const frameWidthMm = (s: CreateState, e: EditEntry | null): number =>
  svgFrame(e?.svg)?.widthMm ?? widthOf(s);

/** מידה לתצוגה: ספרה אחת אחרי הנקודה, בלי אפס נגרר. */
export const mmLabel = (n: number): string => String(Math.round(n * 10) / 10);

/** ספירת החיתוכים מתוך ה-SVG הקנוני (שכבת cutouts).
 *  סופרים תת-מסלולים ולא אלמנטים: הווקטורייזר פולט path אחד שמכיל את כל
 *  התבנית, ולכן ספירת אלמנטים החזירה 1 לכל עיצוב שנוצר במסלול הזה. */
export function countCuts(svg: string | null): number {
  const inner = cutoutsInner(svg);
  if (!inner) return 0;
  let n = 0;
  for (const m of inner.matchAll(/<(path|circle|rect|ellipse|polygon)\b([^>]*)>/g)) {
    if (m[1] !== "path") { n += 1; continue; }
    const d = /\bd="([^"]*)"/.exec(m[2])?.[1] ?? "";
    n += (d.match(/[Mm]/g) ?? []).length || 1;
  }
  return n;
}

/* ===== המצב הפעיל ===== */

export const activeEntry = (s: CreateState): EditEntry | null =>
  s.edits[s.activeEdit >= 0 ? s.activeEdit : s.edits.length - 1] ?? null;

/* ===== בניית הפרומפט למנוע ===== */

const SYM_HE: Record<Symmetry, string> = {
  symmetric: "סימטרי",
  asymmetric: "א-סימטרי",
};
const DENS_HE: Record<Density, string> = {
  low: "צפיפות נמוכה — מעט חיתוכים, הרבה מתכת",
  medium: "צפיפות בינונית",
  high: "צפיפות גבוהה — הרבה חיתוכים עדינים",
};
const FEEL_HE: Record<Feel, string> = {
  delicate: "תחושה עדינה ודקה",
  balanced: "תחושה מאוזנת",
  massive: "תחושה מאסיבית ונוכחת",
};

/** הפרומפט הראשוני. ב"קובץ מוכן לחיתוך" לא נבנה פרומפט — עוברים לוקטוריזציה.
 *
 *  הפתיחה מתארת פריט, לא "דוגמת ניקוב על" פריט: הניסוח הקודם מסר למודל שהעיצוב
 *  הוא החורים בלבד ושהצללית נתונה מראש — וזה הגיע אליו לפני תיאור הלקוחה. */
export function buildPrompt(s: CreateState): string {
  const parts = [
    `עיצוב ${s.product === "ring" ? "טבעת" : "צמיד"} פתוח שנחתך בלייזר מפס מתכת שטוח.`,
    `${SYM_HE[s.symmetry]}, ${DENS_HE[s.density]}, ${FEEL_HE[s.feel]}.`,
  ];
  if (s.brief.trim()) parts.push(`תיאור הלקוחה: ${s.brief.trim()}`);
  if (s.image && s.imageRole === "inspiration") {
    parts.push("התמונה המצורפת היא השראה בלבד — יש לקחת ממנה רוח וסגנון, לא להעתיק.");
  }
  if (s.image && s.imageRole === "sketch") {
    parts.push("התמונה המצורפת היא סקיצה של הלקוחה — יש לצאת ממנה כבסיס לעיצוב.");
  }
  return parts.join(" ");
}

/** פרומפט לשינוי ממוקד אזור, כולל רמזי הכוונון המהיר. */
export function buildEditPrompt(s: CreateState): string {
  const where =
    s.region && s.region !== "all"
      ? `באזור ה${d.regions[s.region]} של הפריט`
      : "בעיצוב כולו";
  return [
    `שינוי ${where}: ${s.editReq.trim()}`,
    `שמור על הכוונון: כ-${s.cutDensity} חיתוכים לאורך, ועובי גשרים של לפחות ${s.bridgeMm} מ"מ.`,
  ].join(" ");
}
