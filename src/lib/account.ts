import { ApiError } from "./api";

// זהות המשתמש הרשום, בעוגייה חתומה.
//
// זה אינו auth מלא: אין סיסמה ואין אימות מייל, כי אין עדיין ספק דואר בפרויקט
// (docs/TODO.md §A3) ולכן אין דרך לשלוח קוד. מי שמזין מייל שכבר קיים חוזר
// לחשבון הקיים — מספיק כדי לדעת מי עיצב מה בבטא לחברים, ולא מספיק כדי להגן
// על חשבון מפני מי שיודע את המייל. השדרוג לקוד חד־פעמי נשען על A3.
//
// מה כן מוגן: העוגייה חתומה HMAC, ולכן אי אפשר להתחזות לחשבון סתם בעריכת
// ה-uuid שבה. בלי החתימה די היה בלנחש/להשיג מזהה פרופיל.

export const ACCOUNT_COOKIE = "rmjewel_uid";
export const ACCOUNT_MAX_AGE = 180 * 24 * 60 * 60; // חצי שנה — בטא, לא בנק

function secretMaterial(): string {
  // ACCOUNT_SECRET אם הוגדר; אחרת מפתח ה-service, שקיים בכל סביבה שבה יש DB
  // בכלל. אין fallback שלישי בכוונה — סוד ברירת־מחדל קבוע שווה לאין חתימה.
  const s = process.env.ACCOUNT_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new ApiError("account_disabled", "Account sessions are not configured", 503);
  return s;
}

let keyPromise: Promise<CryptoKey> | null = null;

function hmacKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretMaterial()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return keyPromise;
}

function b64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(value));
  return b64url(sig);
}

/** השוואה בזמן קבוע — אותה סיבה כמו ב-admin.ts. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** ערך העוגייה: `<uuid>.<signature>`. */
export async function accountCookieValue(accountId: string): Promise<string> {
  return `${accountId}.${await sign(accountId)}`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** מזהה החשבון מהבקשה, או null אם אין עוגייה / החתימה לא תואמת. */
export async function readAccountId(req: Request): Promise<string | null> {
  const raw = readCookie(req, ACCOUNT_COOKIE);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let expected: string;
  try {
    expected = await sign(id);
  } catch {
    // הסוד לא מוגדר — אין דרך לאמת, ולכן אין זהות. לא זורקים: קריאה שלא
    // מחייבת חשבון צריכה להמשיך לעבוד.
    return null;
  }
  return safeEqual(sig, expected) ? id : null;
}

/** כמו readAccountId, אבל 401 כשאין חשבון — למסלול שמחייב זיהוי. */
export async function requireAccountId(req: Request): Promise<string> {
  const id = await readAccountId(req);
  if (!id) throw new ApiError("account_required", "Sign in before designing", 401);
  return id;
}

export function accountCookieHeader(value: string, maxAgeSeconds: number): string {
  return [
    `${ACCOUNT_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}
