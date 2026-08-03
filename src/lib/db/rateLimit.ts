import { supabaseAdmin } from "./supabase";

// הגבלת קצב מבוססת-מסד. ראה migration 0015_rate_events.sql.

/**
 * מחזיר `true` אם הדלי כבר חרג מהמכסה בחלון הזמן (יש לחסום), אחרת רושם את
 * הניסיון ומחזיר `false`.
 *
 * fail-open: כשל תשתית לא נועל את הפעולה — ההגבלה היא שכבת הגנה, לא השער עצמו
 * (הטוקן/המייל הם השער). ניקוי הזדמנותי מוחק אירועים ישנים של אותו דלי אחרי
 * כל רישום, כדי שהטבלה לא תתפח.
 */
export async function tooManyAttempts(
  bucket: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - windowMs).toISOString();
  try {
    const { count, error } = await sb
      .from("rate_events")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .gte("created_at", since);
    if (error) throw new Error(error.message);
    if ((count ?? 0) >= max) return true;
    await sb.from("rate_events").insert({ bucket });
    // ניקוי הזדמנותי — לא חוסם את התשובה גם אם ייכשל.
    await sb.from("rate_events").delete().eq("bucket", bucket).lt("created_at", since);
    return false;
  } catch (e) {
    console.error("rate limit check failed (allowing):", (e as Error).message);
    return false;
  }
}
