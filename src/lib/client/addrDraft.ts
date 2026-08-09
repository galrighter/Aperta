"use client";

/**
 * הכתובת שהוקלדה, שנשמרת בדפדפן.
 *
 * שתי שכבות שומרות אותה, וכל אחת עונה על שאלה אחרת:
 *
 * · **החשבון** (`profiles`, 0020) — "מה מסרתי בפעם הקודמת". חוצה מכשירים,
 *   ושורד ניקוי של הדפדפן.
 * · **כאן** — "מה הקלדתי עכשיו". המשפך כולו חי ב-state בזיכרון, ולכן רענון
 *   של העמוד בשלב האחרון מחק את הכתובת שהיא בדיוק סיימה למלא. זה הפער שאינו
 *   נראה בשום טסט ומתגלה רק כשזה קורה לאדם אמיתי.
 *
 * `localStorage` ולא `sessionStorage`, בשונה מ-`pendingCreate`: מה שנשמר כאן
 * אמור לחזור גם בלשונית חדשה ומחר בבוקר — זו כל הנקודה. ולכן גם **נמחק ביציאה
 * מהחשבון**: מחשב משותף אינו מקרה קצה בסדנה.
 */

const KEY = "aperta.checkout.addr";

export interface AddrDraft {
  name: string; street: string; city: string;
  zip: string; phone: string; email: string;
}

/** רק מחרוזות, ורק השדות המוכרים: מה שנקרא מהדיסק אינו מה שנכתב אליו. */
function clean(raw: unknown): Partial<AddrDraft> | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: Partial<AddrDraft> = {};
  for (const k of ["name", "street", "city", "zip", "phone", "email"] as const) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}

export function loadAddrDraft(): Partial<AddrDraft> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveAddrDraft(addr: AddrDraft): void {
  try {
    const keep = clean(addr);
    if (keep) localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {
    // מכסת אחסון או גלישה פרטית. הטופס עצמו עובד בלי זה.
  }
}

/** ביציאה מהחשבון. הכתובת של מי שיצאה אינה שייכת למי שייכנס אחריה. */
export function clearAddrDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* אין מה לעשות, ואין מה לדווח */
  }
}
