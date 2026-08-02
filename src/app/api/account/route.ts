import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError } from "@/lib/api";
import { readAccountId, requireAccountId, clearLegacyCookieHeader } from "@/lib/account";
import { authClientFor, authConfigured, applyCookies } from "@/lib/supabase/authClient";
import { getAccount, updateAccountDetails, toPublic } from "@/lib/db/accounts";

// החשבון של המבקר. GET = מי אני, PATCH = השלמת שם/טלפון, DELETE = יציאה.
//
// **אין כאן יותר POST.** הכניסה הישנה יצרה חשבון מתוך שם ומייל שהוקלדו בטופס,
// בלי לאמת דבר — מי שידע מייל של חבר נכנס לחשבון שלו. הכניסה עברה כולה
// ל-Supabase Auth (קוד במייל / גוגל), ולהשאיר כאן מסלול שמנפיק זהות מטופס
// פירושו להשאיר את הדלת שה-auth נסגר בשבילה.

export async function GET(req: Request) {
  try {
    const id = await readAccountId(req);
    if (!id) return NextResponse.json({ account: null });
    const account = await getAccount(id);
    if (!account) return NextResponse.json({ account: null });

    // העוגייה המחודשת נכתבת בתוך `readAccountId`, על אותו לקוח שביצע את הרענון.
    // כאן ישבה קריאה שנייה ל-`authClientFor` שה-pending שלה תמיד היה ריק — היא
    // נראתה כמו הגנה, ולא החזירה מעולם שום עוגייה.
    return NextResponse.json({ account: toPublic(account) });
  } catch (err) {
    return handleRouteError(err);
  }
}

const detailsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** השלמת פרטים אחרי הכניסה הראשונה. הזהות כבר מאומתת — כאן רק שם וטלפון. */
export async function PATCH(req: Request) {
  try {
    const id = await requireAccountId(req);
    const body = await parseBody(req, detailsSchema);
    const account = await updateAccountDetails(id, body);
    return NextResponse.json({ account: toPublic(account) });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const res = NextResponse.json({ ok: true });
    if (authConfigured()) {
      const { client, pending } = authClientFor(req);
      await client.auth.signOut();
      applyCookies(res, pending);
    }
    res.headers.append("Set-Cookie", clearLegacyCookieHeader());
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}
