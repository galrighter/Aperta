"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * לקוח Supabase בדפדפן — לפעולות הכניסה בלבד (גוגל, קוד במייל).
 *
 * הוא כותב את עוגיות הסשן שהשרת קורא ב-`readAccountId`, ולכן אין צורך
 * במסלול API משלנו לכניסה: הדפדפן מדבר עם שרת האימות ישירות, והשרת שלנו רק
 * מאמת את מה שהתקבל.
 *
 * המפתחות כאן פומביים ונצרבים בבילד — זה תפקידם. מפתח ה-service לעולם אינו
 * מגיע לצד הזה.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** האם הכניסה מוגדרת בכלל. false = הבילד רץ בלי המפתחות הפומביים. */
export const authConfigured = Boolean(URL_ && KEY);

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!authConfigured) throw new Error("Supabase auth is not configured");
  if (!cached) cached = createBrowserClient(URL_, KEY);
  return cached;
}
