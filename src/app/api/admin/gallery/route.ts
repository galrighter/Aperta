import { NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/db/supabase";

// dialogue mode — הציורים לדף ביקורת הגלריה (‏PROMPT_SPEC §3.2).
//
// התגים עצמם אינם עוברים כאן: `src/data/gallery-tags.json` נקרא ב-import
// סטטי בדף — קובץ בגיט הוא מקור האמת, והנתיב הזה משלים רק את מה שהקובץ
// אינו נושא: ה-SVG של כל גרסה, להצגה ליד התגים. ‏GET לפי רשימת מזהים,
// בקבוצות — הדף מושך רק את מה שמוצג אחרי הסינון.
//
// שער האדמין — כמו כל `/api/admin/*`: העיצובים הם של לקוחות.

const MAX_IDS = 60;

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url);
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS);
    if (!ids.length) throw new ApiError("bad_request", "ids required", 400);

    const { data, error } = await supabaseAdmin()
      .from("design_versions")
      .select("id, svg")
      .in("id", ids);
    if (error) throw new Error(error.message);

    // מפה ולא מערך: הדף מצרף לפי version_id, ורשומה שנמחקה פשוט חסרה —
    // זה בדיוק מצב `missing` של §3.2, והדף אומר אותו במקום להפיל את הכול.
    const svgs: Record<string, string> = {};
    for (const row of (data ?? []) as Array<{ id: string; svg: string | null }>) {
      if (row.svg) svgs[row.id] = row.svg;
    }
    return NextResponse.json({ svgs });
  } catch (err) {
    return handleRouteError(err);
  }
}
