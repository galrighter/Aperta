"use client";

// שמירת העיצובים של הלקוחה. תוספת מעבר ל-handoff (§12 מסמן אותה כפער) —
// העיצוב עצמו וכל גרסאותיו כבר נשמרים בשרת ע"י המנוע; מה שחסר הוא שהלקוחה
// תמצא אותם שוב. בלי מערכת משתמשים, האינדקס נשמר מקומית בדפדפן.

const KEY = "rmjewel.myDesigns";
const MAX = 30;

export interface SavedDesign {
  id: string;
  /** המספר הסידורי מהשרת. designCode() הופך אותו ל-"RM-0007". */
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
  /** עוד אין גרסה — היצירה לא הושלמה. הרשומה נכתבת כבר עם יצירת העיצוב,
   *  כדי שהפרעה באמצע לא תנתק את הלקוחה מעיצוב שכבר קיים בשרת. */
  pending?: boolean;
  /** מה שהוזן בטופס, כדי שאפשר יהיה לחזור ולנסות שוב עם אותם פרטים. */
  brief?: string;
  symmetry?: string;
  density?: string;
  feel?: string;
  fit?: string;
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

function write(list: SavedDesign[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* מכסת אחסון מלאה — לא חוסם את הזרימה */
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
export function mergeMyDesign(incoming: SavedDesign) {
  const list = read();
  const prev = list.find((x) => x.id === incoming.id);
  const merged: SavedDesign = prev
    ? {
        ...prev,
        serial: incoming.serial ?? prev.serial,
        name: incoming.name,
        product: incoming.product,
        circMm: incoming.circMm,
        widthMm: incoming.widthMm,
        // "האם יש כבר גרסה" נקבע בשרת; המקומי עלול להישאר תקוע על pending.
        pending: incoming.pending,
        updatedAt: prev.updatedAt > incoming.updatedAt ? prev.updatedAt : incoming.updatedAt,
      }
    : incoming;
  write([merged, ...list.filter((x) => x.id !== incoming.id)]);
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
