import { NextResponse } from "next/server";
import { authClientFor, authConfigured } from "@/lib/supabase/authClient";
import { applyCookies } from "@/lib/supabase/authClient";
import { clearLegacyCookieHeader } from "@/lib/account";
import { safeNext, withAuthFailed } from "@/lib/authRedirect";

/**
 * החזרה מגוגל (ומכל מסלול PKCE אחר): מחליפים את הקוד בסשן, כותבים את עוגיות
 * הסשן, ומחזירים את המשתמש למקום שממנו יצא.
 *
 * לא תחת `/api/`: זו כתובת שהלקוחה רואה לרגע בשורת הכתובת בדרך חזרה, ואין
 * סיבה שהיא תיראה כמו נתיב שרת.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  const redirect = (to: string) => NextResponse.redirect(new URL(to, url.origin), 303);

  if (!authConfigured() || !code) {
    return redirect(withAuthFailed(next));
  }

  const { client, pending } = authClientFor(req);
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth callback failed:", error.message);
    return redirect(withAuthFailed(next));
  }

  const res = applyCookies(redirect(next), pending);
  // הזהות עברה ל-Supabase; עוגיית הבטא לא צריכה להישאר בדפדפן.
  res.headers.append("Set-Cookie", clearLegacyCookieHeader());
  return res;
}
