import { NextResponse } from "next/server";
import { supabaseAdmin, ensureProfilesSeeded } from "@/lib/db/supabase";
import { handleRouteError } from "@/lib/api";

// ששת הבודקים של הסטודיו הפנימי בלבד.
//
// מאז שמשתמשים רשומים יושבים באותה טבלה (0004_accounts.sql), רשימה לא מסוננת
// כאן הייתה מגישה לכל אחד את השם, המייל ומזהה הפרופיל של כל חבר שנרשם. הסינון
// לפי kind הוא מה שמונע את זה — ולכן אינו קישוט שאפשר להסיר.
export async function GET() {
  try {
    await ensureProfilesSeeded();
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("profiles")
      .select("id, name, color")
      .eq("kind", "tester")
      .order("name");
    // מסד שעוד לא קיבל את 0004: אין בו משתמשים רשומים בכלל, ולכן רשימה לא
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
