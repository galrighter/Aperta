"use client";

// שמירת העיצובים של הלקוחה. תוספת מעבר ל-handoff (§12 מסמן אותה כפער) —
// העיצוב עצמו וכל גרסאותיו כבר נשמרים בשרת ע"י המנוע; מה שחסר הוא שהלקוחה
// תמצא אותם שוב. בלי מערכת משתמשים, האינדקס נשמר מקומית בדפדפן.

const KEY = "rmjewel.myDesigns";

/**
 * תקרת בטיחות, לא מכסת תצוגה.
 *
 * עד היום היא הייתה 30 — מספר שהלקוחה פגשה: הסנכרון מהחשבון מושך את **כל**
 * העיצובים, השורה כתבה שלושים, והשאר נחתכו כאן בשקט. מי שעיצבה יותר מזה
 * איבדה את הישנים מהרשימה בלי שום סימן שהם קיימים. הרשימה מוצגת בעימוד
 * (`savedPaging`), ולכן אורכה כבר אינו בעיה של מסך — ומה שנשאר כאן הוא רק
 * גבול עליון על מה שנכתב לאחסון של הדפדפן.
 */
const MAX = 500;

export interface SavedResult {
  versionId: string;
  versionNo: number;
  path: string;
  cuts: number;
  /** המסגרת שה-path הזה חי בה — נקראת מה-viewBox של הגרסה עצמה. */
  lengthMm?: number;
  widthMm?: number;
}

export interface SavedDesign {
  id: string;
  /** המספר הסידורי מהשרת. designCode() הופך אותו ל-"AP-0007". */
  serial?: number;
  name: string;
  product: "bracelet" | "ring";
  circMm: number;
  widthMm: number;
  cuts: number;
  updatedAt: string;
  /** תצוגה מקדימה: path של החומר במ"מ + מידות התיבה */
  path?: string;
  lengthMm?: number;
  /**
   * הרוחב של **המסגרת שהציור חי בה**, כשהוא נבדל מהרוחב שהוזמן (`widthMm`).
   *
   * שני המספרים אינם אותו דבר, וזה לא פרט: `widthMm` הוא מה שכתוב על הכרטיס
   * ("18 מ״מ" — מה שהלקוחה ביקשה), והמסגרת היא מה שהגרסה באמת יושבת בה, כפי
   * שנקרא מה-viewBox שלה. הכרטיס צייר את ה-path בתוך המידות שהוזמנו, וכל
   * הפרש ביניהן חתך את הפריט — ראו `savedPreview`.
   */
  frameWidthMm?: number;
  /**
   * כל התוצאות של העיצוב, החדשה ראשונה — לא רק זו שמוצגת גדול.
   *
   * שלוש יצירות על אותו עיצוב הן שלוש גרסאות שלו, וזה המודל הנכון: פריט אחד,
   * מספר סידורי אחד. אבל הכרטיס הראה גרסה אחת, ולכן "יצרתי שלוש פעמים ורואה
   * עיצוב אחד" היה תיאור מדויק של מה שקרה על המסך.
   */
  results?: SavedResult[];
  /** עוד אין גרסה — היצירה לא הושלמה. הרשומה נכתבת כבר עם יצירת העיצוב,
   *  כדי שהפרעה באמצע לא תנתק את הלקוחה מעיצוב שכבר קיים בשרת. */
  pending?: boolean;
  /** מה שהוזן בטופס, כדי שאפשר יהיה לחזור ולנסות שוב עם אותם פרטים. */
  brief?: string;
  /** הכיתוב שהוזמן על התכשיט — כדי שחזרה לעיצוב שנקטע תשחזר גם אותו. */
  lettering?: string;
  symmetry?: string;
  density?: string;
  feel?: string;
  fit?: string;
  /** נבחר "שהמודל יחליט" — המאפיינים לא נשלחו. */
  attrsAuto?: boolean;
}

function read(): SavedDesign[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedDesign[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function put(list: SavedDesign[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** רשומה בלי הציורים שלה. הם מה שתופס מקום, והשרת יודע לצייר אותם מחדש. */
const undrawn = (x: SavedDesign): SavedDesign => ({ ...x, path: undefined, results: undefined });

/**
 * כתיבה לאחסון, עם השלה מדורגת כשהמכסה מלאה.
 *
 * קודם הכישלון היה שקט ומוחלט: `setItem` שנכשל השאיר את האחסון כמו שהיה,
 * כלומר **העיצוב החדש לא נשמר בכלל** — הכרטיס שלו לא היה מופיע ברשימה. עכשיו
 * שהתקרה הוסרה זה גם נעשה סביר יותר להיתקל בו.
 *
 * מה שנשמט קודם הוא הציורים, ומהישנים לחדשים: בלי ציור הכרטיס עדיין פותח את
 * העיצוב (והציור נמשך שוב מ-`/api/designs/[id]/preview`), בלי רשומה העיצוב
 * נעלם מהרשימה. ההשלה מכפילה את עצמה בכל סיבוב כדי שניקוי לא יעלה מאות
 * כתיבות, ורק אם גם רשימה בלי ציור אחד לא נכנסת — נחתך הזנב.
 */
function write(list: SavedDesign[]) {
  if (typeof localStorage === "undefined") return;
  const capped = list.slice(0, MAX);
  if (put(capped)) return;

  let kept = capped;
  for (let drawn = Math.floor(capped.length / 2); ; drawn = Math.floor(drawn / 2)) {
    kept = capped.map((x, i) => (i < drawn ? x : undrawn(x)));
    if (put(kept)) return;
    if (drawn === 0) break;
  }
  for (let n = Math.floor(kept.length / 2); n > 0; n = Math.floor(n / 2)) {
    if (put(kept.slice(0, n))) return;
  }
}

export const listMyDesigns = (): SavedDesign[] =>
  read().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

/** שמירה/עדכון של רשומה. נקרא אחרי כל גרסה שחוזרת מהמנוע. */
export function saveMyDesign(entry: SavedDesign) {
  const list = read().filter((x) => x.id !== entry.id);
  write([entry, ...list]);
}

export function removeMyDesign(id: string) {
  write(read().filter((x) => x.id !== id));
}

/**
 * מיזוג רשומה שהגיעה מהשרת אל האינדקס המקומי.
 *
 * לשרת אין את התצוגה המקדימה ואת מה שהוזן בטופס — הם נשמרים רק כאן. לכן
 * הכיוון הוא השלמה ולא דריסה: מהשרת נלקחים המספר הסידורי, השם והמידות (הוא
 * מקור האמת עליהם), ומקומית נשמר כל מה שהוא לא מכיר.
 */
const mergeOne = (prev: SavedDesign, incoming: SavedDesign): SavedDesign => ({
  ...prev,
  serial: incoming.serial ?? prev.serial,
  name: incoming.name,
  product: incoming.product,
  circMm: incoming.circMm,
  widthMm: incoming.widthMm,
  // "האם יש כבר גרסה" נקבע בשרת; המקומי עלול להישאר תקוע על pending.
  pending: incoming.pending,
  updatedAt: prev.updatedAt > incoming.updatedAt ? prev.updatedAt : incoming.updatedAt,
});

export function mergeMyDesign(incoming: SavedDesign) {
  const list = read();
  const prev = list.find((x) => x.id === incoming.id);
  write([prev ? mergeOne(prev, incoming) : incoming, ...list.filter((x) => x.id !== incoming.id)]);
}

/**
 * מיזוג של רשימה שלמה מהחשבון — כתיבה אחת.
 *
 * `mergeMyDesign` בלולאה קורא וכותב את כל האינדקס בכל צעד, וזה ריבועי: חמישים
 * עיצובים הם חמישים סריאליזציות של חמישים רשומות, בטעינת העמוד ובחוט הראשי.
 *
 * הסדר הוא לפי `updatedAt`, מהחדש לישן, כי זה הסדר שהתקרה חותכת לפיו — מה
 * שנשמט כשאין מקום צריך להיות מה שנגעו בו לפני הכי הרבה זמן.
 */
export function mergeMyDesigns(incoming: SavedDesign[]) {
  if (incoming.length === 0) return;
  const byId = new Map(read().map((x) => [x.id, x]));
  for (const inc of incoming) {
    const prev = byId.get(inc.id);
    byId.set(inc.id, prev ? mergeOne(prev, inc) : inc);
  }
  write([...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
}

/**
 * השלמת הציור לרשומה שאין לה אחד — מ-`/api/designs/[id]/preview`.
 *
 * נכתב לאחסון כדי שהחישוב ירוץ פעם אחת לעיצוב ולא בכל פתיחה של הרשימה. כמו
 * `markMyDesignDone`, נוגע רק בשדות שלו ורק ברשומה שכבר קיימת: הוא מגיע מהשרת,
 * שאינו מכיר את התיאור ואת שאר מה שנשמר כאן בלבד.
 */
export function setMyDesignPreview(
  id: string,
  preview: { path: string; lengthMm: number; widthMm: number; cuts: number },
  results?: SavedResult[],
) {
  const list = read();
  const prev = list.find((x) => x.id === id);
  if (!prev) return;
  // אותה תקרה כמו בשמירה המקומית: ציור ענק ממלא את המכסה ומפיל את שמירת
  // **כל** הרשימה, וזה מחיר גבוה מדי עבור ריבוע בגובה 60 פיקסל.
  const fits = (p: string) => p.length < 40_000;
  const path = fits(preview.path) ? preview.path : undefined;
  write([
    {
      ...prev,
      path,
      lengthMm: preview.lengthMm,
      // המסגרת של הציור, ולא הרוחב שהוזמן. שניהם נשמרים: הכיתוב על הכרטיס הוא
      // מה שהלקוחה ביקשה, והציור חייב את המסגרת שהוא נחתך בה — אחרת ההפרש
      // ביניהם מכרסם את הפריט מלמטה.
      frameWidthMm: preview.widthMm,
      cuts: preview.cuts,
      // אותה תקרה לכל תוצאה בנפרד: תוצאה כבדה אחת לא אמורה למחוק את שאר
      // השורה, והכרטיס יודע להציג גם רשימה חלקית.
      results: results?.filter((r) => fits(r.path)),
    },
    ...list.filter((x) => x.id !== id),
  ]);
}

/**
 * סימון עיצוב כמושלם — היצירה שלו הסתיימה.
 *
 * פונקציה משלה ולא `mergeMyDesign` עם רשומה חלקית: המיזוג לוקח מהשרת את השם
 * והמידות, ולכן קריאה איתם ריקים הייתה מוחקת בדיוק את מה שרק כאן קיים. כאן
 * נוגעים בשני שדות ובתנאי שהרשומה כבר קיימת.
 */
export function markMyDesignDone(id: string) {
  const list = read();
  const prev = list.find((x) => x.id === id);
  if (!prev || !prev.pending) return;
  write([
    { ...prev, pending: undefined, updatedAt: new Date().toISOString() },
    ...list.filter((x) => x.id !== id),
  ]);
}

/** ניקוי בהחלפת משתמש. העיצובים עצמם נשארים בשרת — כניסה חוזרת מחזירה אותם. */
export function clearMyDesigns() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* אין מה לעשות אם האחסון חסום */
  }
}
