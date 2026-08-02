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

/**
 * כותב לדפדפן עוגיות סשן שהתחדשו באמצע בקשה — **בלי** שלמסלול תהיה תשובה ביד.
 *
 * זה מה שהיה חסר. `applyCookies` דורש את אובייקט התשובה, ולכן רק שני מסלולים
 * השתמשו בו; כל שאר המסלולים קוראים ל-`requireAccountId` ומחזירים תשובה משלהם,
 * ובה הרענון נזרק. ולזרוק אותו זה לא "להישאר עם הישן": הרענון **מסובב** את
 * ה-refresh token בשרת האימות (`refresh_token_rotation_enabled`), כך שהאסימון
 * שנשאר בדפדפן מת תוך `security_refresh_token_reuse_interval` שניות. השימוש הבא
 * בו נחשב שימוש חוזר, ו-GoTrue מבטל את **כל** הסשן — הלקוחה מוצאת את עצמה
 * מנותקת בלי לגעת בכלום, ו"המשך עיצוב" מחזיר 401.
 *
 * `cookies()` מ-next/headers ולא כותרת על התשובה: זו הדרך היחידה שעובדת מכל
 * מסלול בלי לשנות את החתימה שלו. ייבוא דינמי כדי שהמודול ימשיך להיטען גם מחוץ
 * להקשר בקשה (טסטים), ו-try/catch כי `set` זמין רק ב-Route Handler — במקום
 * שבו הוא לא זמין, ההתנהגות היא בדיוק זו שהייתה עד היום.
 */
export async function persistAuthCookies(pending: CookieWrite[]): Promise<void> {
  if (!pending.length) return;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    for (const c of pending) {
      const o = c.options as {
        maxAge?: number;
        path?: string;
        sameSite?: "lax" | "strict" | "none";
        domain?: string;
      };
      jar.set(c.name, c.value, {
        path: o.path ?? "/",
        // כמו ב-cookieHeader: העוגייה נכתבת מהשרת ואין לה קורא בדפדפן.
        httpOnly: true,
        secure: true,
        sameSite: o.sameSite ?? "lax",
        ...(typeof o.maxAge === "number" ? { maxAge: o.maxAge } : {}),
        ...(o.domain ? { domain: o.domain } : {}),
      });
    }
  } catch {
    /* אין חנות עוגיות ניתנת לכתיבה בהקשר הזה — לא סיבה להפיל את הבקשה */
  }
}
