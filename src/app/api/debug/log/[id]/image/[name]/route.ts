import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { getRun, type RunStagePaths } from "@/lib/db/runs";
import { signedUrl } from "@/lib/db/storage";

// תמונה אחת של הרצה אחת, כהפניה לכתובת חתומה.
//
// הרשימה חתמה קודם חמש כתובות לכל שורה — 400 בקשות ל-Supabase בבקשה אחת, מול
// תקרה של 50 subrequests ל-invocation. החתימה ה-50 נכשלה, sign() בלע את
// השגיאה והחזיר null, ומהשורה העשירית ואילך היומן הופיע בלי אף תמונה: "ריק"
// בלי הודעת שגיאה. כאן כל תמונה היא בקשה נפרדת עם התקציב שלה — שתי חתימות
// לכל היותר — ולדפדפן ממילא נוח יותר לטעון אותן במקביל ולשמור אותן במטמון.

export const maxDuration = 30;

const NAMES = ["render", "input", "conditioned", "overlay", "difference", "rendered"] as const;
type ImageName = (typeof NAMES)[number];

export async function GET(req: Request, ctx: { params: Promise<{ id: string; name: string }> }) {
  try {
    // בלי השער הזה כתובת חתומה להדמיה של לקוחה מונפקת לכל מי שמבקש.
    requireAdmin(req);
    const { id, name } = await ctx.params;
    if (!NAMES.includes(name as ImageName)) {
      throw new ApiError("bad_request", `Unknown image ${name}`, 400);
    }
    const row = await getRun(id);
    if (!row) throw new ApiError("not_found", `Run ${id} not found`, 404);

    const path =
      name === "render"
        ? row.render_path
        : name === "input"
          ? row.input_image_path
          : ((row.stage_paths ?? {}) as RunStagePaths)[name as keyof RunStagePaths];
    if (!path) throw new ApiError("not_found", `Run ${id} has no ${name}`, 404);

    return NextResponse.redirect(await signedUrl(path, 3600), 302);
  } catch (err) {
    return handleRouteError(err);
  }
}
