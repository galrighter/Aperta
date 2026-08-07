import type { AuthError } from "@supabase/supabase-js";

/**
 * מה בדיוק נכשל בשער הזיהוי.
 *
 * נכתב אחרי תקלה אמיתית: מפתח ה-SMTP של שירות האימות פג תוקף, `POST /otp`
 * החזיר 500 על כל בקשה, והממשק ענה "הזיהוי נכשל. נסו שוב" — משפט שמאשים את
 * הכניסה, מזמין בדיוק את הפעולה היחידה שלא יכלה להצליח, ומסתיר שכניסת גוגל
 * שלידו עבדה כרגיל.
 *
 * ההבחנה היא לא בין סוגי שגיאות אלא בין הפעולות שהן מבקשות מהמשתמשת: לתקן את
 * מה שהקלידה, לחכות, לנסות מסלול אחר, או לבדוק את החיבור.
 */
export type AuthFailure = "rate" | "server" | "network" | "other";

export function classifyAuthError(e: Pick<AuthError, "status" | "code">): AuthFailure {
  // `status` חסר או 0 כשהבקשה לא הגיעה לשרת בכלל — אין תשובה לסווג לפיה.
  if (!e.status) return "network";
  // הסטטוס מספיק ברוב המקרים; ה-`code` נבדק כי מגבלת שליחת המיילים מגיעה גם
  // כ-`over_email_send_rate_limit` בתוך 4xx אחר.
  if (e.status === 429 || (e.code ?? "").includes("rate_limit")) return "rate";
  if (e.status >= 500 || e.code === "unexpected_failure") return "server";
  return "other";
}
