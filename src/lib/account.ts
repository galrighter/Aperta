import { ApiError } from "./api";
import { authClientFor, authConfigured } from "./supabase/authClient";
import { linkAuthUser } from "./db/accounts";

/**
 * זהות המשתמש — מ-Supabase Auth.
 *
 * האימות (קוד חד־פעמי במייל, או חשבון גוגל) מנוהל ב-`auth.users`; הבעלות
 * ממשיכה לשבת ב-`profiles`, ו-`designs.profile_id` לא השתנה. לכן המכסה
 * היומית, רשימת העיצובים וה-FK עובדים בדיוק כמו קודם.
 *
 * **החתימה נשארה.** מסלולי ה-API קוראים ל-`requireAccountId(req)` כמו קודם;
 * מה שהשתנה הוא רק מאיפה היא שולפת את הזהות.
 *
 * ## למה העוגייה החתומה הישנה נמחקה, ולא הושארה כמסלול מעבר
 *
 * `rmjewel_uid` הייתה חתומה, אבל היא נופקה בלי שום אימות: מי שהזין מייל קיים
 * קיבל את החשבון. להשאיר אותה כמסלול קריאה "לתקופת מעבר" פירושו להשאיר בדיוק
 * את החור שהכניסה המאומתת נועדה לסגור — ומסלול עוקף שקיים הוא מסלול שנשאר.
 *
 * המחיר חד־פעמי וקטן: חבר שהיה באמצע עיצוב נדרש להיכנס שוב. הוא **לא** מאבד
 * כלום — `linkAuthUser` מוצא את החשבון הקיים לפי המייל ומצמיד אליו את המשתמש
 * המאומת, על כל העיצובים שכבר עשה.
 */

/** העוגייה של הבטא. נשארת בקוד רק כדי למחוק אותה מהדפדפן. */
export const LEGACY_ACCOUNT_COOKIE = "rmjewel_uid";

/** `Set-Cookie` שמוחק את עוגיית הבטא. */
export function clearLegacyCookieHeader(): string {
  return `${LEGACY_ACCOUNT_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * מזהה הפרופיל של המשתמש המחובר, או null.
 *
 * `getUser()` ולא `getSession()`: הראשונה מאמתת את הטוקן מול שרת האימות,
 * והשנייה סומכת על תוכן העוגייה — כלומר על מה שהדפדפן שלח.
 */
export async function readAccountId(req: Request): Promise<string | null> {
  if (!authConfigured()) return null;

  const { client } = authClientFor(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const account = await linkAuthUser({
    authUserId: data.user.id,
    email: data.user.email,
    // גוגל מוסרת שם; מסלול המייל לא, ואז השם נאסף אחרי הכניסה הראשונה.
    name: (meta.full_name as string) || (meta.name as string) || null,
  });
  return account.id;
}

/** כמו readAccountId, אבל 401 כשאין חשבון — למסלול שמחייב זיהוי. */
export async function requireAccountId(req: Request): Promise<string> {
  const id = await readAccountId(req);
  if (!id) throw new ApiError("account_required", "Sign in before designing", 401);
  return id;
}
