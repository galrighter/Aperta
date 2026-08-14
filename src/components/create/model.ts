// מודל מסע היצירה — טיפוסים, תמחור, המרות גאומטריה ובניית הפרומפט למנוע.
// מקור: handoff_design_flow/HANDOFF.md
import type { MultiPolygon, ValidationReport } from "@/lib/geometry/types";
import { he } from "@/i18n/he";
import { designSampleCode } from "@/lib/designCode";
import { svgFrame } from "@/lib/geometry/frame";
import { FAB, type FitStyle } from "@/lib/fabrication.config";
import { computeSizing, idMmFromUsSize, US_RING_ID_MM, US_RING_SIZES } from "@/lib/sizing";
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

export type Rail = Array<{ key: keyof typeof d.steps; screens: Screen[] }>;

/** ששת השלבים בסרגל. "processing" אינו שלב עצמאי — הוא מוצג תחת "עיצוב". */
export const RAIL: Rail = [
  { key: "product", screens: ["product"] },
  { key: "sizes", screens: ["sizes"] },
  { key: "brief", screens: ["brief", "processing"] },
  { key: "result", screens: ["result"] },
  { key: "summary", screens: ["summary"] },
  { key: "checkout", screens: ["checkout", "done"] },
];

/**
 * story mode — אותם מסכים, סדר אחר.
 *
 * במסלול הפשוט המוצר והסיפור נמסרו כבר ב-`/story/create`, ולכן שני השלבים
 * הראשונים של הסרגל הרגיל אינם קיימים כאן: המסע נכנס ישר ליצירה. **והמידה
 * זזה**: היא נשאלת אחרי שיש מה להזמין, כי במסלול הזה אין סיבה לבקש מדידה
 * ממישהי שעוד לא ראתה תרגום אחד לסיפור שלה. הפרשנות קודמת למספר.
 *
 * הסרגל חייב להכיר את הסדר הזה ולא רק להציג אותו: הוא גם ניווט, ולחיצה על
 * "מוצר" במסלול שאין בו מסך מוצר הייתה מוציאה מהמסלול בלי דרך חזרה.
 */
export const STORY_RAIL: Rail = [
  { key: "brief", screens: ["brief", "processing"] },
  { key: "result", screens: ["result"] },
  { key: "sizes", screens: ["sizes"] },
  { key: "summary", screens: ["summary"] },
  { key: "checkout", screens: ["checkout", "done"] },
];

export const railFor = (story: boolean): Rail => (story ? STORY_RAIL : RAIL);

/** מיקום המסך בסרגל של המסלול. ‎-1 כשהמסך אינו חלק ממנו. */
export const railIndex = (story: boolean, screen: Screen): number =>
  railFor(story).findIndex((r) => r.screens.includes(screen));

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
  /**
   * העיצוב שהגרסה הזו יושבת עליו, כשהוא שונה מהעיצוב של המשפך.
   *
   * מאז 10.8 בקשת שינוי נשמרת כדוגמה ממוספרת (`AP-0085.2`) — עיצוב משלה,
   * שהמספר שלו הוא האינדיקציה למקור. הזמנה, שיתוף ובחירת הצעה על הגרסה הזו
   * חייבים להצביע עליה ולא על עיצוב-האב. ריק = הגרסה על עיצוב המשפך (יצירה
   * ראשונה, או שרת ישן).
   */
  designId?: string;
  /** המספר להצגה (`AP-0085.2`) — מחושב פעם אחת מהתשובה. */
  designCode?: string | null;
}

export interface Addr {
  name: string; street: string; city: string;
  zip: string; phone: string; email: string;
}

export interface CreateState {
  screen: Screen;
  product: Product | null;

  /**
   * story mode — הגיעו מהמסלול הפשוט (`/story`).
   *
   * הדגל יושב כאן ולא ב-state נפרד של העמוד מאותה סיבה כמו `fromShare`: הוא
   * חייב לשרוד את היציאה לגוגל וחזרה. `stashCreateState` שומר את המצב הזה
   * במלואו, ובלי הדגל בתוכו מי שנדרשה להזדהות באמצע הייתה חוזרת מהכניסה
   * למסלול הרגיל — עם הרוחב, הפקדים והניסוחים שלו.
   *
   * `false` בכל מסלול אחר, וזו ברירת המחדל של המערכת.
   */
  story: boolean;

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
  /** המספר הסידורי של העיצוב **ששותף** — לשורה "מזמינים את עיצוב AP-0047".
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
  /**
   * קוד הכשל, לבדו. `procErrorDetail` נועד לעין אנושית ולא להשוואה, ומה שנדרש
   * כאן הוא הכרעה: יש כשלים שניסיון חוזר מתקן ויש כשלים שהוא רק חוזר עליהם.
   * ראו `RETRY_POINTLESS` ב-ProcessingScreen.
   */
  procErrorCode: string | null;
  /**
   * כמה יצירות נכשלו ברצף, בלי הצלחה ביניהן.
   *
   * שני כשלים הם הרגע שבו "נסו שוב" מפסיק להיות התשובה: המשתמש כבר ניסה שוב,
   * וזה לא עבד. מכאן המסך אומר שהתקלה חוזרת ונרשמת אצלנו, ומציע לשלוח משוב —
   * במקום להזמין לחיצה שלישית לתוך אותו קיר. מתאפס בהצלחה ובחזרה לעיצוב.
   */
  procFailCount: number;
  /**
   * נפתח עיצוב בלי גרסה — יצירה שנקטעה או נכשלה לפני שנשמרה תוצאה. מסך
   * התיאור מציג על זה הסבר: נחיתה שקטה על הטופס נראית כמו עיצוב שנעלם.
   */
  resumeIncomplete: boolean;
  /**
   * מה שקורה בהמתנה, כפי שהלקוחה צריכה לדעת עליו. `rendering`/`saving` מגיעים
   * מהשרת; `disconnected` נכתב בדפדפן כשהבקשה נקטעה וההמתנה עברה לשורת ה-job.
   *
   * המצב האחרון הוא הסיבה שהשדה קיים: בלעדיו ניתוק נראה בדיוק כמו המתנה
   * רגילה — או, עד AP-0090, כמו כישלון.
   */
  procStage: string | null;
  /** כשל במעבר בין הצעות. procError מוצג רק במסך העיבוד, ולכן לא היה למי
   *  לספר שהלחיצה נכשלה — היא פשוט לא עשתה כלום. */
  chooseError: string | null;
  /** כשל בבקשת שינוי. עד כה הוא נבלע: הכפתור חזר מ"מחיל…" ל"החלת שינוי",
   *  שום דבר על המסך לא זז, ולא היה שום סימן שהבקשה בכלל נשלחה. */
  editError: string | null;
  applying: boolean;
  /**
   * story mode — העיצוב ממוסגר מחדש למידה שנבחרה בדרך להזמנה.
   *
   * נפרד מ-`applying`, שמסמן בקשת שינוי במסך התוצאה: זו פעולה על מסך אחר,
   * עם כפתור אחר, וכפתור אחד שמאופר בגלל פעולה של מסך אחר הוא בדיוק סוג
   * ה"כפתור המת" שאין לו הסבר.
   */
  resizing: boolean;

  // תוצאה
  resultMode: ResultMode;
  region: Region | null;
  editReq: string;

  // סיכום ותשלום
  terms: boolean;
  /** הסכמה לדיוור. נפרדת מאישור התנאים, ולעולם לא מסומנת מראש. */
  marketing: boolean;
  /**
   * מלכודת הבוטים. שדה מוסתר שאדם אינו רואה ואינו יכול למקד — ולכן כל ערך בו
   * הוא סקריפט שמילא HTML. השרת בולע הזמנה כזאת בשקט מאז ההתחלה; מה שחסר היה
   * השדה עצמו.
   */
  company: string;
  addr: Addr;
  /**
   * מזהה ניסיון השליחה. נוצר בלחיצה הראשונה ונשמר עד שההזמנה נקלטה, כך
   * ש"נסי שוב" אחרי רשת שנתקעה מגיע לשרת עם אותו מפתח — ומחזיר את ההזמנה
   * שכבר נשמרה במקום ליצור שנייה. מתאפס אחרי הצלחה: הזמנה הבאה היא הזמנה.
   */
  orderKey: string | null;
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
  story: false,
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
  procErrorCode: null,
  procFailCount: 0,
  resumeIncomplete: false,
  procStage: null,
  chooseError: null,
  editError: null,
  applying: false,
  resizing: false,
  resultMode: "render",
  region: "all",
  editReq: "",
  terms: false,
  marketing: false,
  company: "",
  addr: { name: "", street: "", city: "", zip: "", phone: "", email: "" },
  orderKey: null,
  sending: false,
  sendError: null,
  sendMailto: null,
  orderNo: null,
};

/**
 * מזהה ניסיון שליחה (uuid v4).
 *
 * `crypto.randomUUID` קיים בכל דפדפן עדכני, אבל **רק בהקשר מאובטח** — ובלעדיו
 * הוא `undefined`, לא שגיאה. מפתח שאינו נוצר פירושו כפתור שזורק במקום לשלוח,
 * ולכן יש כאן נפילה לאחור מלאה: getRandomValues, ורק אם גם הוא חסר — Math.random.
 * האקראיות של השלב האחרון גרועה, וזה בסדר: תפקיד המפתח הוא להבחין בין שני
 * ניסיונות של אותו אדם, לא להיות סוד.
 */
export function newOrderKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // גרסה 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** תשובת מנוע, במה שנדרש כדי לבנות ממנה גרסה. טיפוס מבני ולא הטיפוס של
 *  ה-client, כדי ששני מסלולי היצירה (גנרציה ווקטוריזציה) ייכנסו לאותה דלת. */
type GenerationLike = {
  version: { id: string; version_no: number; svg: string };
  lengthMm?: number;
  report: ValidationReport | null;
  geometry: { material: MultiPolygon } | null;
  candidates?: Array<{ svg: string; report: ValidationReport }>;
  /** העיצוב שהגרסה נשמרה עליו — בעריכה זו דוגמה ממוספרת חדשה. השדות רשות,
   *  כי גם תשובת "להזמין כזה" עוברת כאן והטיפוס שלה מציין פחות. */
  design?: { id: string; serial?: number | null; root_serial?: number | null; sample_no?: number | null };
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
    // העיצוב של הגרסה נוסע עם השורה: הזמנה ושיתוף של גרסת-עריכה חייבים
    // להצביע על הדוגמה שלה (`AP-0085.2`), לא על עיצוב-האב של המשפך.
    designId: res.design?.id,
    designCode: res.design
      ? designSampleCode({
          serial: res.design.serial,
          root_serial: res.design.root_serial,
          sample_no: res.design.sample_no,
        })
      : undefined,
  };
}

/** העיצוב שפעולה על הגרסה המוצגת צריכה להצביע עליו — שלה, או של המשפך. */
export const entryDesignId = (s: CreateState, e: EditEntry | null): string | null =>
  e?.designId ?? s.designId;

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
 * השדות שמאפסים עיצוב קיים: פלט המנוע (designId, גרסאות) והזמניים שנתלים בו.
 * משותף להחלפת מוצר ולשינוי מידה — בשני המקרים הגאומטריה שנוצרה כבר לא תואמת
 * את מה שהלקוחה בחרה, וחייבים לייצר מחדש. הבריף/כיתוב/תמונות **לא** מתאפסים:
 * הם כוונת הלקוחה, ואפשר לייצר איתם מחדש.
 */
export function invalidateDesign(): Partial<CreateState> {
  return {
    designId: null,
    designSerial: null,
    edits: [],
    activeEdit: -1,
    procError: null,
    procErrorDetail: null,
    procErrorCode: null,
    procFailCount: 0,
    resumeIncomplete: false,
    procStage: null,
    chooseError: null,
    editError: null,
    resultMode: "render",
  };
}

/**
 * מאיזה כשל רצוף המסך מפסיק להציע "נסו שוב" כתשובה היחידה. שניים: הראשון
 * יכול להיות מקרה, השני הוא בדיוק המשתמש שכבר לחץ "נסו שוב" וזה לא עבד.
 */
export const RECURRING_FAILURES = 2;

/** שדות המידה — שינוי שלהם על עיצוב קיים מבטל אותו (ראו `invalidateDesign`). */
export const SIZE_KEYS = [
  "ringPreset", "ringSize", "wristPreset", "circ", "fit", "ringWidth", "braceletWidth",
] as const satisfies readonly (keyof CreateState)[];

/**
 * ה-patch שיש להחיל כשבוחרים מוצר במסך המוצר.
 *
 * מעבר בין מוצרים **אחרי** שכבר נוצר עיצוב חייב לאפס את פלט העיצוב: גאומטריית
 * צמיד אינה טבעת. בלי האיפוס הזה `activeEntry` היה ממשיך להצביע על הגרסה הישנה,
 * המסך היה מציג את סקיצת הצמיד כטבעת, וההזמנה הייתה נשלחת עם `productType` חדש
 * ו-`versionId` של הפריט הישן — כלומר פריט אחד מוזמן ופריט אחר נחתך.
 */
export function switchProduct(s: CreateState, picked: Product): Partial<CreateState> {
  const base: Partial<CreateState> = abandonsShare(s, picked)
    ? { product: picked, fromShare: null, fromShareSerial: null, adoptError: null }
    : { product: picked };
  // אין עיצוב לאבד, או שזו בחירה חוזרת באותו מוצר — רק קביעת המוצר.
  if (picked === s.product || s.designId === null) return base;
  return { ...base, ...invalidateDesign() };
}

/** האם ה-patch משנה מידה בפועל (ערך שונה ממה שיש כבר) — הבסיס לביטול עיצוב. */
export function sizeReallyChanged(s: CreateState, patch: Partial<CreateState>): boolean {
  return SIZE_KEYS.some((k) => k in patch && patch[k] !== s[k]);
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

/**
 * הטווח שהשדה "מידה מדויקת" מקבל, במ"מ.
 *
 * זו מדידה של גוף, ולכן הגבולות הם אנטומיים ולא ייצוריים: 9 ס"מ הוא פרק יד של
 * תינוק ו-26 ס"מ הוא פרק יד גדול מאוד. הם רחבים בכוונה — התפקיד היחיד שלהם הוא
 * לתפוס מספר שאינו מדידה בכלל.
 *
 * בטבעת השדה מקבל **שתי** צורות (ראו `circumferenceMm`): עד 30 זו מידה
 * אמריקאית, שממילא נצבטת לטבלה ב-`idMmFromUsSize`, ומעליה זה היקף במ"מ. לכן
 * הטווח כאן חל רק על הצורה השנייה.
 */
export const CIRC_LIMIT_MM: Record<Product, [number, number]> = {
  // התחתית היא פרק יד של תינוק (9 ס"מ), ובכוונה: מידות ילדים הן מוצר, לא
  // טעות. מה שנחסם הוא מספר שאינו מדידה — 10 או 16, כלומר סנטימטרים בשדה
  // שמבקש מילימטרים.
  bracelet: [90, 260],
  // בטבעת זהו **אותו טווח** של הטבלה, בצורתו השנייה: היקף אצבע הוא π·ID, ומי
  // שמדד בחוט לא אמור לקבל תשובה אחרת ממי שהשתמש במודד טבעות. מעוגל החוצה
  // למ"מ שלם — 38.9 ו-78.0 הם הקצוות המדויקים.
  ring: [
    Math.floor(Math.PI * US_RING_ID_MM[String(US_RING_SIZES[0])]),
    Math.ceil(Math.PI * US_RING_ID_MM[String(US_RING_SIZES[US_RING_SIZES.length - 1])]),
  ],
};

/**
 * טווח המידה האמריקאית שהשדה מקבל — **נגזר** מהטבלה התקנית ולא נכתב שוב.
 *
 * למה זו בדיקה בכלל: `idMmFromUsSize` **צובט** ערך שמחוץ לטבלה לקצה שלה,
 * בשקט. מידה 20 הפכה שם ל-13 ומידה 0.5 ל-1 — כלומר בדיוק אותו כשל שהוצא
 * מ-`lengthHintMm`: מדידה של הלקוחה שתוקנה למספר אחר בלי שאיש יידע. הצביטה
 * נשארת כרשת ביטחון בשרת; כאן היא נעצרת ונאמרת.
 *
 * ולמה נגזר ולא קבוע: שני מספרים שאומרים את אותו דבר נפרדים ביום שבו אחד מהם
 * משתנה. הטבלה התרחבה ל-1–16 (3.8.26) והטווח כאן התרחב איתה מעצמו.
 */
export const US_SIZE_LIMIT: [number, number] = [
  US_RING_SIZES[0],
  US_RING_SIZES[US_RING_SIZES.length - 1],
];

/**
 * המידה שהוזנה אינה מדידה אפשרית — ומה להגיד עליה.
 *
 * `null` כשאין בעיה, וגם כשלא הוזנה מידה מדויקת בכלל: כפתור סטנדרטי לא יכול
 * להיות מחוץ לטווח.
 *
 * **חוסם ולא מתקן.** `FAB.lengthHintMm` מתעד למה חיתוך שקט של מידה הוא הדבר
 * הגרוע ביותר שאפשר לעשות כאן (AP-0065: הוזמן 11 ס"מ ונשמר פס ל-13 ס"מ, בלי
 * חיווי). מה שנוסף עכשיו הוא הכיוון ההפוך: מידה שאי אפשר לייצר לפיה גם לא
 * ממשיכה בשקט הלאה. ב-AP-0077 (3.8.26) הוזן היקף 10 — עשרה מילימטרים — והמסע
 * המשיך עד להדמיה של ריבוע 15.8×18 מ"מ שהמודל צייר נאמנה לפי הפרומפט.
 */
export interface SizeIssue {
  /** `circumference` — היקף במ"מ; `usSize` — מידת טבעת אמריקאית. הכיוונים
   *  נבדלים ביחידה, ולכן גם בהודעה: "מ"מ" על מידה 20 היה שטות. */
  kind: "circumference" | "usSize";
  value: number;
  lo: number;
  hi: number;
}

export function sizeIssue(s: CreateState): SizeIssue | null {
  if (!hasExactSize(s)) return null;
  const product = s.product ?? "bracelet";
  const value = parseFloat(product === "ring" ? s.ringSize : s.circ);
  // בטבעת השדה מקבל שתי צורות (ראו `circumferenceMm`), וכל אחת נבדקת מול
  // הטווח שלה: עד 30 זו מידה אמריקאית, מעליה זה היקף במ"מ.
  if (product === "ring" && value <= 30) {
    const [lo, hi] = US_SIZE_LIMIT;
    return value < lo || value > hi ? { kind: "usSize", value, lo, hi } : null;
  }
  const [lo, hi] = CIRC_LIMIT_MM[product];
  return value < lo || value > hi ? { kind: "circumference", value, lo, hi } : null;
}

/* ===== תמחור (handoff §7) ===== */

// החישוב עצמו עבר ל-`src/lib/pricing.ts`, כדי שהשרת יחשב את אותו מחיר ולא
// יקבל אותו מהדפדפן. כאן נשארה רק ההסבה ממצב המסך לקלט של הפונקציה.
export { SHIPPING } from "@/lib/pricing";
export type { Price } from "@/lib/pricing";

// מה שהיה כאן ואיננו: `densityForPrice` — הצפיפות שהתמחור עבד לפיה, עם נפילה
// לבינונית ב"שהמודל יחליט". מרגע שהמחיר קבוע למוצר (ראו lib/pricing.ts) אין
// לצפיפות שום תפקיד בתמחור, והפונקציה הייתה הסבה למספר שאיש לא קורא.
// הצפיפות עצמה נשארה בדיוק כפי שהייתה — היא מעצבת את הפריט, לא את המחיר.

export const priceOf = (s: CreateState): Price =>
  priceFor({ productType: s.product ?? "bracelet" });

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
 *  הוא החורים בלבד ושהצללית נתונה מראש — וזה הגיע אליו לפני תיאור הלקוחה.
 *
 *  **"פח" ולא "פס".** אותה הסרה נעשתה באנגלית (`strip` יצא מ-buildRenderPrompt),
 *  והמילה חזרה מכאן — במשפט הראשון של תיאור הלקוחה, שהוא מה שהמודל קורא. "פס"
 *  הוא כבר צורה: מלבן ארוך וצר. "פח" הוא חומר הגלם, וזה מה שהמשפט אומר. */
export function buildPrompt(s: CreateState): string {
  const parts = [
    `עיצוב ${s.product === "ring" ? "טבעת" : "צמיד"} פתוח שנחתך בלייזר מפח מתכת שטוח.`,
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
 * ב-AP-0074: הבקשה הגיעה לשרת בלי תיאור ובלי תמונה, עם ברירות המחדל בלבד,
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
