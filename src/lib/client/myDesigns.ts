"use client";

// שמירת העיצובים של הלקוחה. תוספת מעבר ל-handoff (§12 מסמן אותה כפער) —
// העיצוב עצמו וכל גרסאותיו כבר נשמרים בשרת ע"י המנוע; מה שחסר הוא שהלקוחה
// תמצא אותם שוב. בלי מערכת משתמשים, האינדקס נשמר מקומית בדפדפן.

const KEY = "rmjewel.myDesigns";
const MAX = 30;

export interface SavedDesign {
  id: string;
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
