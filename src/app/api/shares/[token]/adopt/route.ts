import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { requireAccountId } from "@/lib/account";
import { isShareToken } from "@/lib/shareToken";
import { getShareByToken } from "@/lib/db/shares";
import { supabaseAdmin } from "@/lib/db/supabase";
import { insertVersion } from "@/lib/db/designs";
import { rescaleCutoutsSvg } from "@/lib/geometry/frame";
import { validateDesign } from "@/lib/geometry/validate";
import { difference, rectPolygon } from "@/lib/geometry/poly";
import { he } from "@/i18n/he";

/**
 * "להזמין כזה" — עותק של עיצוב ששותף, במידה של מי שמזמין.
 *
 * **למה זה לא `duplicate`.** שכפול מעתיק את המידות של המקור, וזה בדיוק מה
 * שאסור כאן: תכשיט נחתך לפי פרק היד של מי שעונד אותו, ולינק מסתובב בין אנשים
 * שונים. מה שמועתק הוא **הדוגמה**; אורך הפריסה נקבע מהמידה החדשה, וה-SVG נמתח
 * אליו (`rescaleCutoutsSvg`) — אותה מתיחה שהמנוע עושה לכל הצעה שהוא מחזיר.
 *
 * **הוולידציה רצה שוב, ותוצאתה נמסרת כמו שהיא.** מתיחה משנה רוחבי גשרים: מה
 * שעבר ב-160 מ"מ יכול ליפול ב-190. מסך התוצאה כבר יודע להציג מצב ייצור, כולל
 * כישלון — ולכן התשובה חוזרת עם הדוח האמיתי ולא מסתירה אותו. עיצוב שנכשל הוא
 * עדיין עיצוב שאפשר לבקש עליו שינוי, וזו התשובה הנכונה במקום 500.
 *
 * הבעלות נקבעת מהחשבון המחובר. השיתוף אינו נותן גישה לעיצוב המקורי — הוא נותן
 * את הדוגמה, ומה שנוצר כאן הוא עיצוב חדש של המזמין.
 */

export const maxDuration = 60;

const schema = z.object({
  lengthMm: z.number().positive().max(2000),
  widthMm: z.number().positive().max(200),
  gapMm: z.number().positive().max(200).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!isShareToken(token)) throw new ApiError("not_found", "No such share", 404);

    const body = await parseBody(req, schema);
    // כאן נוצרת רשומה שצריכה בעלים — ולכן זה הרגע שדורש זיהוי, בדיוק כמו
    // ביצירה רגילה.
    const profileId = await requireAccountId(req);

    const share = await getShareByToken(token);
    if (!share) throw new ApiError("not_found", "No such share", 404);

    const lengthMm = round1(body.lengthMm);
    const widthMm = round1(body.widthMm);
    const gapMm = body.gapMm ?? Number(share.gap_mm);
    const thicknessMm = Number(share.thickness_mm);

    // מתיחת הדוגמה למסגרת של המזמין. `rescaleCutoutsSvg` מסרב לכל פקודת מסלול
    // שאינה M/L/Z — גאומטריה שנחתכת במתכת אינה מקום לפרשנות.
    let svg: string;
    try {
      svg = rescaleCutoutsSvg(share.svg, { lengthMm, widthMm });
    } catch (e) {
      throw new ApiError("rescale_failed", (e as Error).message, 422);
    }

    const { report, normalized } = validateDesign(svg, {
      productType: share.product_type,
      lengthMm,
      widthMm,
      thicknessMm,
    });

    const { data: design, error } = await supabaseAdmin()
      .from("designs")
      .insert({
        profile_id: profileId,
        name: `${share.product_type === "ring" ? he.ring : he.bracelet} · ${Math.round(lengthMm + gapMm)}${he.design.mm}`,
        product_type: share.product_type,
        length_mm: lengthMm,
        width_mm: widthMm,
        gap_mm: gapMm,
        thickness_mm: thicknessMm,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const version = await insertVersion({
      design_id: design.id,
      svg: normalized?.canonicalSvg ?? svg,
      source: "generate",
      user_prompt: null,
      annotation_png_path: null,
      // מאיזה שיתוף זה בא. נשמר בדוח (jsonb) ולא בעמודה, מאותה סיבה שנתיב
      // ההדמיה נשמר שם: זה מטא-דאטה של מקור, והוא מה שיאפשר לענות בבק־אופיס
      // על "מאיפה הגיעה ההזמנה הזו".
      validation_report: { ...report, fromShareToken: share.token },
      validation_status: report.status,
    });

    const geometry = normalized
      ? {
          material: difference([rectPolygon(0, 0, lengthMm, widthMm)], normalized.cutUnion),
          cutUnion: normalized.cutUnion,
        }
      : null;

    return NextResponse.json(
      { design: { ...design, current_version_id: version.id }, version, report, geometry, lengthMm, widthMm },
      { status: 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
