import { ApiError } from "./api";
import { ADMIN_COOKIE } from "./adminCookie";

// שער אדמין קליל מבוסס shared-secret (ADMIN_TOKEN). זה אינו auth משתמשים מלא —
// הוא מיועד למפעיל יחיד (גל) כדי לנהל פניות. בלי ADMIN_TOKEN — האדמין מושבת.

export { ADMIN_COOKIE };

function adminToken(): string | null {
  const t = process.env.ADMIN_TOKEN;
  return t && t.length >= 8 ? t : null;
}

/** האם האדמין מוגדר בכלל (יש ADMIN_TOKEN תקין). */
export function adminConfigured(): boolean {
  return adminToken() !== null;
}

/** השוואה בזמן קבוע כדי למנוע timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** בדיקת הסיסמה שנשלחה בהתחברות. */
export function checkAdminToken(candidate: string): boolean {
  const t = adminToken();
  if (!t) return false;
  return safeEqual(candidate, t);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** לזרוק שגיאה אם הבקשה אינה מאדמין מאומת. */
export function requireAdmin(req: Request): void {
  const t = adminToken();
  if (!t) throw new ApiError("admin_disabled", "Admin is not configured (set ADMIN_TOKEN)", 503);
  const cookie = readCookie(req, ADMIN_COOKIE);
  if (!cookie || !safeEqual(cookie, t)) {
    throw new ApiError("unauthorized", "Admin authentication required", 401);
  }
}

/** מחרוזת Set-Cookie להתחברות (או לניקוי אם value ריק). */
export function adminCookieHeader(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}
