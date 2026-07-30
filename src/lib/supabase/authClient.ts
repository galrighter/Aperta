import { createServerClient } from "@supabase/ssr";

/**
 * לקוח Supabase שקורא (וכותב) את עוגיות הסשן של בקשה אחת.
 *
 * זה **אינו** `supabaseAdmin` מ-`db/supabase.ts`: שם מפתח ה-service עוקף כל
 * הרשאה ומשמש לגישה לנתונים, וכאן המפתח הוא הפומבי והתפקיד היחיד הוא לשאול
 * "מי המשתמש המחובר". שני דברים שונים בכוונה — הצלבה ביניהם הופכת כל בקשה
 * למורשית.
 */

export const PUBLIC_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const PUBLIC_KEY = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function authConfigured(): boolean {
  return Boolean(PUBLIC_URL() && PUBLIC_KEY());
}

export type CookieWrite = { name: string; value: string; options: Record<string, unknown> };

/**
 * הלקוח + העוגיות שהוא ביקש לכתוב. Supabase מרענן טוקן שפג בזמן הקריאה,
 * ואז יש עוגייה חדשה שחייבת לחזור בתשובה — אחרת המשתמש נזרק החוצה בשקט אחרי
 * שעה, וזה נראה בדיוק כמו "הכניסה לא נשמרת".
 */
export function authClientFor(req: Request): {
  client: ReturnType<typeof createServerClient>;
  pending: CookieWrite[];
} {
  const pending: CookieWrite[] = [];

  const client = createServerClient(PUBLIC_URL(), PUBLIC_KEY(), {
    cookies: {
      getAll() {
        const header = req.headers.get("cookie");
        if (!header) return [];
        return header
          .split(";")
          .map((part) => {
            const idx = part.indexOf("=");
            if (idx === -1) return null;
            return {
              name: part.slice(0, idx).trim(),
              value: decodeURIComponent(part.slice(idx + 1).trim()),
            };
          })
          .filter((c): c is { name: string; value: string } => c !== null);
      },
      setAll(cookies) {
        for (const c of cookies) pending.push({ ...c, options: c.options ?? {} });
      },
    },
  });

  return { client, pending };
}

/** ממיר עוגייה שהלקוח ביקש לכתוב לכותרת `Set-Cookie`. */
export function cookieHeader(c: CookieWrite): string {
  const o = c.options as {
    maxAge?: number;
    path?: string;
    sameSite?: string;
    domain?: string;
    expires?: Date;
  };
  const parts = [
    `${c.name}=${encodeURIComponent(c.value)}`,
    `Path=${o.path ?? "/"}`,
    "HttpOnly",
    "Secure",
    `SameSite=${o.sameSite ?? "Lax"}`,
  ];
  if (typeof o.maxAge === "number") parts.push(`Max-Age=${o.maxAge}`);
  if (o.domain) parts.push(`Domain=${o.domain}`);
  return parts.join("; ");
}

/** מוסיף לתשובה את כל העוגיות שהלקוח ביקש לכתוב. */
export function applyCookies(res: Response, pending: CookieWrite[]): Response {
  for (const c of pending) res.headers.append("Set-Cookie", cookieHeader(c));
  return res;
}
