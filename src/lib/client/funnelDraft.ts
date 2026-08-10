"use client";

import type { CreateState, Density, Feel, Fit, Product, Symmetry } from "@/components/create/model";

/**
 * טיוטת המשפך — המידות, מאפייני העיצוב, התיאור והכיתוב, כפי שהוקלדו עכשיו.
 *
 * המשפך כולו חי ב-state בזיכרון, ולכן עד כאן רענון — או יצירה שנכשלה לפני
 * שנוצרה רשומה בשרת — מחק את כל מה שמולא. מי שמדדה יד, כיוונה מאפיינים וכתבה
 * תיאור איבדה את הכול ברגע הגרוע ביותר: בדיוק כשמשהו אחר כבר השתבש. הרשומה
 * המקומית של "העיצובים שלי" לא מכסה את זה — היא נכתבת רק אחרי שהעיצוב נוצר
 * בשרת.
 *
 * `localStorage` ולא `sessionStorage`, מאותה סיבה כמו טיוטת הכתובת: מה שמולא
 * אמור לחזור גם מחר בבוקר ובלשונית חדשה. ולכן גם נמחק ביציאה מהחשבון —
 * מחשב משותף אינו מקרה קצה בסדנה.
 *
 * **התמונה אינה נשמרת.** data URL של תמונה שוקל עד מגהבייטים, מכסת האחסון
 * משותפת לכל האתר, וכתיבה שנכשלת על מכסה הייתה מפילה גם את שמירת הטקסט —
 * החלק שאי אפשר לצלם מחדש.
 */

const KEY = "aperta.create.draft";

/** השדות שנשמרים — קלט של המשתמש בלבד, לא פלט מנוע ולא מצב מסך. */
export interface FunnelDraft {
  product?: Product;
  wristPreset?: string;
  circ?: string;
  fit?: Fit;
  braceletWidth?: number;
  ringPreset?: string;
  ringSize?: string;
  ringWidth?: number;
  symmetry?: Symmetry;
  density?: Density;
  feel?: Feel;
  attrsAuto?: boolean;
  brief?: string;
  lettering?: string;
}

const PRODUCTS = ["bracelet", "ring"] as const;
const FITS = ["tight", "regular", "loose"] as const;
const SYMS = ["symmetric", "asymmetric"] as const;
const DENS = ["low", "medium", "high"] as const;
const FEELS = ["delicate", "balanced", "massive"] as const;

/** רק ערכים חוקיים, ורק השדות המוכרים: מה שנקרא מהדיסק אינו מה שנכתב אליו. */
function clean(raw: unknown): FunnelDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: FunnelDraft = {};

  const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    allowed.includes(v as T) ? (v as T) : undefined;
  const str = (v: unknown, max = 4000): string | undefined =>
    typeof v === "string" && v ? v.slice(0, max) : undefined;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1000 ? v : undefined;

  out.product = oneOf(src.product, PRODUCTS);
  out.wristPreset = str(src.wristPreset, 40);
  out.circ = str(src.circ, 20);
  out.fit = oneOf(src.fit, FITS);
  out.braceletWidth = num(src.braceletWidth);
  out.ringPreset = str(src.ringPreset, 40);
  out.ringSize = str(src.ringSize, 20);
  out.ringWidth = num(src.ringWidth);
  out.symmetry = oneOf(src.symmetry, SYMS);
  out.density = oneOf(src.density, DENS);
  out.feel = oneOf(src.feel, FEELS);
  if (typeof src.attrsAuto === "boolean") out.attrsAuto = src.attrsAuto;
  out.brief = str(src.brief);
  out.lettering = str(src.lettering, 40);

  for (const k of Object.keys(out) as Array<keyof FunnelDraft>) {
    if (out[k] === undefined) delete out[k];
  }
  return Object.keys(out).length ? out : null;
}

export function loadFunnelDraft(): FunnelDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * נשמר על כל שינוי במשפך, מרגע שנבחר מוצר. הערכים נלקחים כמו שהם — כולל
 * ברירות מחדל: הטיוטה משקפת את המצב, לא מנחשת מה מתוכו "חשוב".
 */
export function saveFunnelDraft(s: CreateState): void {
  if (!s.product) return;
  try {
    const draft: FunnelDraft = {
      product: s.product,
      wristPreset: s.wristPreset,
      circ: s.circ,
      fit: s.fit,
      braceletWidth: s.braceletWidth,
      ringPreset: s.ringPreset,
      ringSize: s.ringSize,
      ringWidth: s.ringWidth,
      symmetry: s.symmetry,
      density: s.density,
      feel: s.feel,
      attrsAuto: s.attrsAuto,
      brief: s.brief,
      lettering: s.lettering,
    };
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // מכסת אחסון או גלישה פרטית. המשפך עצמו עובד בלי זה.
  }
}

/** ביציאה מהחשבון, ואחרי הזמנה שנקלטה — הטיוטה מיצתה את תפקידה. */
export function clearFunnelDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* אין מה לעשות, ואין מה לדווח */
  }
}
