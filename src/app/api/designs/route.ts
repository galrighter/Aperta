import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/db/supabase";
import { handleRouteError, parseBody } from "@/lib/api";
import { requireAccountId } from "@/lib/account";
import { requireAdmin } from "@/lib/admin";
import { getAccount } from "@/lib/db/accounts";
import { FAB } from "@/lib/fabrication.config";
import { STORY_MODE } from "@/lib/story/mode";

/**
 * העיצובים של פרופיל אחד.
 *
 * `profileId` נכבד רק כשהוא של בודק — זהו מסלול הסטודיו הפנימי, שאין לו חשבון.
 * בכל מקרה אחר הבעלות נלקחת מהעוגייה החתומה. אחרת די היה במזהה פרופיל של חבר
 * כדי למשוך את כל מה שהוא עיצב.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const asked = url.searchParams.get("profileId");
    let profileId: string | null = null;
    if (asked) {
      const target = await getAccount(asked);
      // מסלול הבודק הוא הסטודיו הפנימי — מאחורי שער האדמין. בלי זה רשימת
      // העיצובים של כל בודק הייתה נמשכת בידי כל אנונימי שהחזיק את המזהה.
      if (target?.kind === "tester") { requireAdmin(req); profileId = target.id; }
    }
    if (!profileId) profileId = await requireAccountId(req);

    const { data, error } = await supabaseAdmin()
      .from("designs")
      .select("id, serial, name, product_type, length_mm, width_mm, gap_mm, thickness_mm, current_version_id, created_at, updated_at")
      .eq("profile_id", profileId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ designs: data });
  } catch (err) {
    return handleRouteError(err);
  }
}

const createSchema = z.object({
  /** מסלול הסטודיו הפנימי בלבד — נכבד רק אם הוא פרופיל בודק. באתר הציבורי
   *  הבעלות נקבעת מהעוגייה החתומה ולא ממה שהדפדפן מבקש. */
  profileId: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  productType: z.enum(["bracelet", "ring"]),
  lengthMm: z.number().positive().optional(),
  widthMm: z.number().positive().optional(),
  gapMm: z.number().positive().optional(),
  thicknessMm: z.number().positive().optional(),
  /**
   * 0024 — המסלול שהעיצוב נוצר בו. `story` בלבד, וריק בכל השאר.
   *
   * זו עובדה על העיצוב ולא בקשה: במסלול Story המידה נשאלת אחרי התוצאה, ולכן
   * מי שחוזרת לעיצוב שמור חייבת לקבל את אותו סדר שלבים — גם ממכשיר אחר.
   */
  mode: z.literal(STORY_MODE).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, createSchema);

    let profileId: string | null = null;
    if (body.profileId) {
      const asked = await getAccount(body.profileId);
      // יצירת עיצוב בבעלות בודק = מסלול הסטודיו הפנימי, מאחורי שער האדמין.
      // בלי זה כל אנונימי יכול היה לייצר עיצובי בודק ולשרוף כסף OpenAI.
      if (asked?.kind === "tester") { requireAdmin(req); profileId = asked.id; }
    }
    if (!profileId) profileId = await requireAccountId(req);

    const p = FAB.products[body.productType];
    const insert = {
      profile_id: profileId,
      name: body.name ?? undefined,
      product_type: body.productType,
      length_mm: body.lengthMm ?? p.defaultLengthMm,
      width_mm: body.widthMm ?? p.defaultWidthMm,
      gap_mm: body.gapMm ?? p.defaultGapMm,
      thickness_mm: body.thicknessMm ?? FAB.defaultThicknessMm,
    };
    // `mode` נשלח רק כשהוא קיים, כמו שדות 0012 ב-`insertVersion`: מסד שעוד לא
    // קיבל את 0024 דוחה עמודה שאינו מכיר, וכשל כאן הוא כשל של **יצירת העיצוב**
    // כולה. במקרה כזה נשמר עיצוב בלי המסלול — פחות טוב, אבל לא חוסם.
    const sb = supabaseAdmin();
    const withMode = body.mode ? { ...insert, mode: body.mode } : insert;
    let { data, error } = await sb.from("designs").insert(withMode).select("*").single();
    if (error && body.mode && /column .* does not exist|schema cache/i.test(error.message)) {
      console.error("designs.mode missing (0024 not applied yet):", error.message);
      ({ data, error } = await sb.from("designs").insert(insert).select("*").single());
    }
    if (error) throw new Error(error.message);
    return NextResponse.json({ design: data }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
