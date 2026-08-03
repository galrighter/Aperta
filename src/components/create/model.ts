// מודל מסע היצירה — טיפוסים, תמחור, המרות גאומטריה ובניית הפרומפט למנוע.
// מקור: handoff_design_flow/HANDOFF.md
import type { MultiPolygon, ValidationReport } from "@/lib/geometry/types";
import { he } from "@/i18n/he";
import { svgFrame } from "@/lib/geometry/frame";
import { FAB, type FitStyle } from "@/lib/fabrication.config";
import { computeSizing, idMmFromUsSize } from "@/lib/sizing";
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

/**
 * סגנון הישיבה → רמת החופש במודל המידות. הלקוחה עדיין לא מזינה תוספת להיקף
 * (handoff §3.3) — היא בוחרת מילה, והתוספת נגזרת ב-lib/sizing.ts.
 *
 * שינוי מהמימוש הקודם: הפתח (Gap) *אינו* נגזר מסוג הישיבה יותר. קודם
 * tight/regular/loose בחרו פתח 18/25/33 מ"מ, ומכיוון שאורך הפריסה היה
 * `היקף − פתח`, ההיקף הפנימי בפועל כמעט לא זז — שלוש האפשרויות נתנו מרווח של
 * ‎−3.9 / −3.2 / −1.7 מ"מ, כלומר כולן הדוקות מהיד הנמדדת וההפרש ביניהן 2.2 מ"מ
 * בלבד. הכפתור שינה את גודל הפתח, לא את הישיבה. עכשיו הפתח הוא קבוע אנטומי
 * (פתח ההשחלה) והישיבה היא תוספת להיקף — ראו docs/sizing-fit-review.md §4.1.
 */
export const FIT_TO_STYLE: Record<Fit, FitStyle> = {
  tight: "snug",
  regular: "comfort",
  loose: "loose",
};

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
  /**
   * "שהמודל יחליט": המאפיינים אינם נכנסים לפרומפט, והמודל גוזר סימטריה,
   * צפיפות ותחושה מהתיאור החופשי. ברירת המחדל היא בחירה מפורשת — שלושת
   * המאפיינים נשארים במצב שנבחר, כדי שביטול הסימון יחזיר אותם בדיוק.
   */
  attrsAuto: boolean;
  image: ImageFile | null;
  imageRole: ImageRole | null;
  brief: string;
  /**
   * הכיתוב שיופיע על התכשיט. **אינו חלק מהפרומפט** — הוא נחתך מהפונט בשרת
   * ונמסר למודל התמונה כתמונת ייחוס (lib/render/letteringImage.ts), כי מודל
   * התמונה כותב עברית תקינה אבל לא תמיד את המילה שביקשו.
   */
  lettering: string;

  /**
   * הגיעו לכאן מ"להזמין כזה" בדף שיתוף — הטוקן של העיצוב שמזמינים.
   *
   * יושב ב-`CreateState` ולא ב-state נפרד כדי שישרוד את היציאה לגוגל וחזרה:
   * `stashCreateState` שומר את המצב הזה, ומי שנדרש להזדהות באמצע חוזר לאותו
   * עיצוב במקום למסך בחירת מוצר ריק.
   */
  fromShare: string | null;
  /** המספר הסידורי של העיצוב **ששותף** — לשורה "מזמינים את עיצוב RM-0047".
   *  שדה משלו ולא `designSerial`: זה מספר של עיצוב אחר, של מישהו אחר, ומה
   *  שייווצר כאן יקבל מספר משלו. */
  fromShareSerial: number | null;
  /** רץ עכשיו העתק של העיצוב המשותף למידה שנבחרה. */
  adopting: boolean;
  adoptError: string | null;

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
  /** כשל בבקשת שינוי. עד כה הוא נבלע: הכפתור חזר מ"מחיל…" ל"החלת שינוי",
   *  שום דבר על המסך לא זז, ולא היה שום סימן שהבקשה בכלל נשלחה. */
  editError: string | null;
  applying: boolean;

  // תוצאה
  resultMode: ResultMode;
  region: Region | null;
  editReq: string;

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
  attrsAuto: false,
  image: null,
  imageRole: null,
  brief: "",
  lettering: "",
  fromShare: null,
  fromShareSerial: null,
  adopting: false,
  adoptError: null,
  designId: null,
  designSerial: null,
  edits: [],
  activeEdit: -1,
  procError: null,
  procErrorDetail: null,
  chooseError: null,
  editError: null,
  applying: false,
  resultMode: "render",
  region: "all",
  editReq: "",
  terms: false,
  addr: { name: "", street: "", city: "", zip: "", phone: "", email: "" },
  sending: false,
  sendError: null,
  sendMailto: null,
  orderNo: null,
};

/** תשובת מנוע, במה שנדרש כדי לבנות ממנה גרסה. טיפוס מבני ולא הטיפוס של
 *  ה-client, כדי ששני מסלולי היצירה (גנרציה ווקטוריזציה) ייכנסו לאותה דלת. */
type GenerationLike = {
  version: { id: string; version_no: number; svg: string };
  lengthMm?: number;
  report: ValidationReport | null;
  geometry: { material: MultiPolygon } | null;
  candidates?: Array<{ svg: string; report: ValidationReport }>;
};

/**
 * גרסה חדשה מתשובת המנוע.
 *
 * משותפת ליצירה הראשונה ולבקשת שינוי. עד כה כל אחת מהן בנתה את הרשומה בעצמה,
 * ובעריכה השדה `candidates` פשוט לא הועתק — כך שכל שינוי הציג הצעה אחת בזמן
 * שהמנוע החזיר את אותן שלוש-ארבע כמו ביצירה, שילם עליהן, ואף שמר אותן על
 * הגרסה. הן הופיעו על המסך רק אחרי רענון, שטוען את הגרסה מהשרת.
 */
export function entryFromGeneration(
  res: GenerationLike,
  meta: { region: Region | null; text: string },
): EditEntry {
  return {
    versionId: res.version.id,
    versionNo: res.version.version_no,
    lengthMm: res.lengthMm ?? null,
    region: meta.region,
    text: meta.text,
    svg: res.version.svg,
    report: res.report,
    geometry: res.geometry,
    candidates: res.candidates,
  };
}

/** מה שדרוש כדי לאתר את ההצעות של גרסה — לא הטיפוס המלא, כדי שהפונקציות
 *  למטה יהיו ניתנות לבדיקה בלי לבנות שורת גרסה שלמה. */
type CandidateCarrier<C> = { generation_id?: string | null; candidates?: C[] | null };

/**
 * ההצעות שמורות **פעם אחת** לכל הרצה — על הגרסה שההרצה יצרה. גרסה שנוצרה
 * מבחירת הצעה נושאת רק את `generation_id` ולא משכפלת את הרשימה, אחרת עיצוב עם
 * חמש בחירות היה סוחב את אותן ארבע הצעות חמש פעמים בכל טעינה.
 */
export function candidatesByGeneration<C>(versions: Array<CandidateCarrier<C>>): Map<string, C[]> {
  const byRun = new Map<string, C[]>();
  for (const v of versions) {
    if (v.generation_id && v.candidates?.length) byRun.set(v.generation_id, v.candidates);
  }
  return byRun;
}

/** ההצעות של גרסה: שלה אם יש, אחרת אלה של ההרצה שממנה היא באה. */
export function candidatesOf<C>(
  v: CandidateCarrier<C>,
  byRun: Map<string, C[]>,
): C[] | undefined {
  return v.candidates?.length ? v.candidates : byRun.get(v.generation_id ?? "");
}

/**
 * מה מוצג בשורה ביומן הגרסאות.
 *
 * שלוש דרכים בלבד יוצרות גרסה, ורק אחת מהן נושאת טקסט: היצירה הראשונה (אינדקס
 * 0, בלי טקסט), בקשת שינוי (עם הטקסט שהוזן), ובחירת הצעה אחרת (בלי טקסט).
 * לכן "אינדקס גדול מ-0 ובלי טקסט" הוא בדיוק בחירת הצעה.
 *
 * קודם היומן הציג `text || versionOriginal`, וכך כל בחירת הצעה הופיעה בתור
 * "העיצוב המקורי" — מי שבחר שלוש הצעות ראה שלוש שורות שכולן טוענות שהן המקור.
 * ההבחנה כאן לפי מיקום ולא לפי שדה חדש, כדי שהיא תעבוד גם על עיצוב שנטען
 * מחדש מהשרת: שם `user_prompt` של בחירת הצעה הוא null, בדיוק כמו של הראשונה.
 */
export function versionEntryLabel(entry: EditEntry, index: number): string {
  if (entry.text) return entry.text;
  return index === 0 ? d.versionOriginal : d.versionPicked;
}

/**
 * האם בחירת מוצר עכשיו מוותרת על העיצוב ששותף.
 *
 * מי שהגיע מ"להזמין כזה" נוחת על מסך המידות, אבל סרגל השלבים מאפשר לחזור
 * למסך המוצר. עיצוב ששותף הוא צמיד **או** טבעת: בחירת האחר פירושה שאין יותר
 * מה להעתיק, והמסע חוזר להיות רגיל. בלי ההכרעה הזו האורך היה מחושב למוצר
 * החדש בזמן שהשרת מעתיק את הישן.
 *
 * בחירה חוזרת באותו מוצר אינה ויתור — שום דבר לא השתנה.
 */
export function abandonsShare(s: CreateState, picked: Product): boolean {
  return s.fromShare != null && s.product != null && picked !== s.product;
}

/**
 * ה-patch שיש להחיל כשבוחרים מוצר במסך המוצר.
 *
 * מעבר בין מוצרים **אחרי** שכבר נוצר עיצוב חייב לאפס את פלט העיצוב: גאומטריית
 * צמיד אינה טבעת. בלי האיפוס הזה `activeEntry` היה ממשיך להצביע על הגרסה הישנה,
 * המסך היה מציג את סקיצת הצמיד כטבעת, וההזמנה הייתה נשלחת עם `productType` חדש
 * ו-`versionId` של הפריט הישן — כלומר פריט אחד מוזמן ופריט אחר נחתך. הבריף,
 * הכיתוב והתמונות נשמרים: הם כוונת הלקוחה, ואפשר לייצר איתם מחדש למוצר החדש.
 */
export function switchProduct(s: CreateState, picked: Product): Partial<CreateState> {
  const base: Partial<CreateState> = abandonsShare(s, picked)
    ? { product: picked, fromShare: null, fromShareSerial: null, adoptError: null }
    : { product: picked };
  // אין עיצוב לאבד, או שזו בחירה חוזרת באותו מוצר — רק קביעת המוצר.
  if (picked === s.product || s.designId === null) return base;
  return {
    ...base,
    designId: null,
    designSerial: null,
    edits: [],
    activeEdit: -1,
    procError: null,
    procErrorDetail: null,
    chooseError: null,
    editError: null,
    resultMode: "render",
  };
}

/* ===== נגזרות מידה ===== */

export const widthOf = (s: CreateState): number =>
  s.product === "ring" ? s.ringWidth : s.braceletWidth;

/** ההיקף בפועל: קלט מדויק גובר על הכפתור הסטנדרטי (handoff §3.3). */
export function circumferenceMm(s: CreateState): number {
  if (s.product === "ring") {
    const exact = parseFloat(s.ringSize);
    // מידת טבעת (4–13) מומרת להיקף; מעל 30 — הוזן היקף במ"מ ישירות.
    // ההמרה עוברת בטבלת ה-ID התקנית ולא בקירוב ליניארי: הקירוב הקודם
    // (44.8 + מידה × 1.6) סטה יותר ויותר ככל שהמידה עלתה — במידה 13 הוא
    // נתן היקף גדול ב-2.5 מ"מ מהתקן.
    if (!Number.isNaN(exact) && exact > 0) {
      return exact > 30 ? exact : Math.PI * idMmFromUsSize(exact);
    }
    return d.ringPresets.find((p) => p.id === s.ringPreset)?.mm ?? 55;
  }
  const exact = parseFloat(s.circ);
  if (!Number.isNaN(exact) && exact > 0) return exact;
  return d.wristPresets.find((p) => p.id === s.wristPreset)?.mm ?? 165;
}

/** פתח ההשחלה — קבוע אנטומי לפי סוג המוצר, לא פונקציה של הישיבה (ראו FIT_TO_STYLE). */
export const gapOf = (s: CreateState): number =>
  s.product === "ring" ? FAB.products.ring.defaultGapMm : FAB.products.bracelet.defaultGapMm;

/**
 * אורך הרצועה השטוחה. עובר דרך מודל המידות (lib/sizing.ts) ולא דרך
 * `היקף − פתח`: הפריסה נמדדת על הציר הניטרלי ולכן חסר לה האיבר 2πKt, והפתח
 * הוא מיתר שצריך להמיר לקשת. בצמיד ההפרש קטן, בטבעת הוא הצטבר עד 3.2 מידות
 * במידה 13. פירוט ומספרים: docs/sizing-fit-review.md §2.
 */
export function stripLengthMm(s: CreateState): number {
  const product = s.product ?? "bracelet";
  const circ = circumferenceMm(s);
  const common = {
    product,
    thicknessMm: FAB.defaultThicknessMm,
    widthMm: widthOf(s),
    gapChordMm: gapOf(s),
  } as const;
  const raw =
    product === "ring"
      ? computeSizing({ ...common, idMm: circ / Math.PI }).blankLengthMm
      : computeSizing({ ...common, wristMm: circ, fit: FIT_TO_STYLE[s.fit] }).blankLengthMm;
  // בלי חיתוך לטווח. מה שהיה כאן קודם דחף כל תוצאה לתוך
  // `lengthRangeMm = [125, 215]`, ובשקט: היקף 11 ס"מ חושב נכון ל-104.4 מ"מ
  // ונשמר 125.0 — תכשיט לפרק יד של 13 ס"מ, בלי הודעה ובלי דרך לדעת. מידה
  // היא מדידה של הלקוחה, לא הצעה שאנחנו מתקנים.
  return Math.round(raw * 10) / 10;
}

/** האם הוזנה מידה מדויקת (ולכן הכפתור הסטנדרטי מבוטל). */
export const hasExactSize = (s: CreateState): boolean => {
  const v = parseFloat(s.product === "ring" ? s.ringSize : s.circ);
  return !Number.isNaN(v) && v > 0;
};

/* ===== תמחור (handoff §7) ===== */

// החישוב עצמו עבר ל-`src/lib/pricing.ts`, כדי שהשרת יחשב את אותו מחיר ולא
// יקבל אותו מהדפדפן. כאן נשארה רק ההסבה ממצב המסך לקלט של הפונקציה.
export { SHIPPING } from "@/lib/pricing";
export type { Price } from "@/lib/pricing";

/** הצפיפות שהתמחור עובד לפיה. ב"שהמודל יחליט" אין צפיפות שנבחרה, ולכן נלקחת
 *  הבינונית — תוספת המורכבות לא יכולה להיגזר ממה שעוד לא נוצר, ולחייב לפי
 *  התוצאה פירושו מחיר שמשתנה אחרי שהוצג. */
export const densityForPrice = (s: CreateState): Density => (s.attrsAuto ? "medium" : s.density);

export const priceOf = (s: CreateState): Price =>
  priceFor({ productType: s.product ?? "bracelet", widthMm: widthOf(s), density: densityForPrice(s) });

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

/**
 * דיוק הציור בכרטיס "העיצובים שלי", במ"מ. הכרטיס גבוה 60 פיקסל ורחב פס של
 * 180 מ"מ — כלומר פיקסל אחד הוא כשליש מ"מ, ועשירית מ"מ היא כבר מתחת לרזולוציה.
 */
const PREVIEW_STEP_MM = 0.1;

/**
 * אותו ציור, בגודל שנכנס לאחסון.
 *
 * המתאר שחוזר מהמעקב נושא נקודה כל 0.02–0.1 מ"מ. ב-`mpToPath`, שנועד
 * לגאומטריה, זה נכון — וכ-path זה עשרות אלפי תווים לעיצוב אחד. גם המקומי וגם
 * השרת זורקים ציור מעל 40,000 תווים (מכסת localStorage היא לכל האתר), ולכן
 * דווקא עיצוב עשיר בחיתוכים — זה שהכי כדאי לזהות בעין — הופיע ברשימה בלי
 * תמונה. עיגול לרשת של עשירית מ"מ מאחד כל 3–5 נקודות רצופות לאחת ומקצר גם כל
 * מספר; הצורה זהה בעין, והציור נכנס.
 */
export function mpToPreviewPath(mp: MultiPolygon | null | undefined): string {
  if (!mp?.length) return "";
  const snap = (n: number) => Math.round(n / PREVIEW_STEP_MM) * PREVIEW_STEP_MM;
  const parts: string[] = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      const pts: string[] = [];
      let prev = "";
      for (const [x, y] of ring) {
        const p = `${round(snap(x))},${round(snap(y))}`;
        if (p === prev) continue;
        pts.push(p);
        prev = p;
      }
      // טבעת שהתכווצה לקו אינה צורה — היא הייתה מציירת שערה על הכרטיס.
      if (pts.length >= 3) parts.push(`M${pts.join("L")}Z`);
    }
  }
  return parts.join(" ");
}

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
  ];
  // ב"שהמודל יחליט" השורה הזאת לא נכתבת בכלל. שליחת ברירות המחדל היא הוראה
  // לכל דבר — "סימטרי, צפיפות בינונית, מאוזן" — והיא סותרת תיאור חופשי שמבקש
  // משהו אחר, בלי שהלקוחה ביקשה אף אחד מהשלושה.
  if (!s.attrsAuto) {
    parts.push(`${SYM_HE[s.symmetry]}, ${DENS_HE[s.density]}, ${FEEL_HE[s.feel]}.`);
  }
  if (s.brief.trim()) parts.push(`תיאור הלקוחה: ${s.brief.trim()}`);
  // כשיש כיתוב, התמונה שמצורפת למודל היא הכיתוב החתוך ולא הקובץ של הלקוחה
  // (`_reference` בקופסה בוחר אחת). משפט שמפנה ל"תמונה המצורפת" היה מפנה
  // אותו לתמונה הלא נכונה — הוא היה קורא את פס הכיתוב כסקיצה שלה.
  if (!s.lettering.trim()) {
    if (s.image && s.imageRole === "inspiration") {
      parts.push("התמונה המצורפת היא השראה בלבד — יש לקחת ממנה רוח וסגנון, לא להעתיק.");
    }
    if (s.image && s.imageRole === "sketch") {
      parts.push("התמונה המצורפת היא סקיצה של הלקוחה — יש לצאת ממנה כבסיס לעיצוב.");
    }
  }
  return parts.join(" ");
}

/**
 * האם יש בכלל ממה לייצר — תיאור, כיתוב, או תמונה.
 *
 * ההגדרה יושבת כאן ולא במסך כי **שני** מקומות שולחים ליצירה: הכפתור, וההרצה
 * שממשיכה מעצמה אחרי כניסה לחשבון (`startAfterSignIn`). לכפתור הייתה בדיקה
 * ולמסלול השני לא, ולכן הרצה יכלה לצאת עם טופס ריק — וזה בדיוק מה שקרה
 * ב-RM-0074: הבקשה הגיעה לשרת בלי תיאור ובלי תמונה, עם ברירות המחדל בלבד,
 * והלקוחה קיבלה אחרי המתנה עיצוב שלא ביקשה. מוטב לא לשלוח מאשר לשלוח כלום.
 */
export function canGenerate(s: CreateState): boolean {
  return Boolean(s.brief.trim() || s.lettering.trim() || s.image || s.imageRole === "ready");
}

/** אורך הכיתוב המרבי בממשק. הגבול האמיתי הוא הפס עצמו והוא נבדק בשרת — כאן
 *  רק תקרה שמונעת מהלקוחה לכתוב משפט שלם ולגלות זאת רק אחרי ההמתנה. */
export const MAX_LETTERING = 24;

/**
 * פרומפט לשינוי. העיצוב הקיים נמסר למודל כתמונה (src/lib/render/baseImage.ts),
 * ולכן כאן נשארת רק הבקשה עצמה — מה לשנות, ואיפה.
 *
 * מה שהיה כאן ואיננו: "כוונון מהיר" — שני מחוונים (צפיפות חיתוכים, עובי גשרים)
 * שנספחו לכל בקשת שינוי. הם הוסרו (גל, 31.7): מספר חיתוכים שרירותי שהלקוחה
 * גררה אינו קשור לעיצוב שעל המסך, והוא סתר את הבקשה שלה בדיוק במקום שבו היא
 * ביקשה לשמר. עובי הגשרים ממילא נאכף בוולידציה ואינו נתון לבחירה.
 */
export function buildEditPrompt(s: CreateState): string {
  const where =
    s.region && s.region !== "all"
      // he.design.regions כבר אומר "אזור ימין"; ה-ה' הידיעה שהייתה כאן ייצרה
      // "באזור האזור ימין".
      ? `ב${d.regions[s.region]} של הפריט`
      : "בעיצוב כולו";
  return `שינוי ${where}: ${s.editReq.trim()}`;
}
