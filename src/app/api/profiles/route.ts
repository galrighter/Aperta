import { NextResponse } from "next/server";
import { supabaseAdmin, ensureProfilesSeeded } from "@/lib/db/supabase";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";

// ששת הבודקים של הסטודיו הפנימי בלבד.
//
// מאחורי שער האדמין: הרשימה חושפת את מזהי הבודקים, וזה המפתח שפתח את כל
// שרשרת הבודקים (יצירה/קריאה/מחיקה על עיצובי בודק בלי אימות). הסטודיו קורא
// לכאן מאחורי AdminGate, ולכן העוגייה נלווית לבקשה. הסינון לפי kind נשאר —
// גם אדמין לא צריך לראות כאן חשבונות של לקוחות.
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    await ensureProfilesSeeded();
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("profiles")
      .select("id, name, color")
      .eq("kind", "tester")
      .order("name");
    // מסד שעוד לא קיבל את 0008: אין בו משתמשים רשומים בכלל, ולכן רשימה לא
    // מסוננת אינה חושפת דבר. הסטודיו ממשיך לעבוד.
    if (error && /does not exist|schema cache/i.test(error.message)) {
      const legacy = await sb.from("profiles").select("id, name, color").order("name");
      if (legacy.error) throw new Error(legacy.error.message);
      return NextResponse.json({ profiles: legacy.data });
    }
    if (error) throw new Error(error.message);
    return NextResponse.json({ profiles: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
