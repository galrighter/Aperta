import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/db/supabase";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import { buildRenderPrompt } from "@/lib/llm/imagegen";
import { planRender, maxRows } from "@/lib/render/panels";
import { canvasFor, canvasOf, sizeParam } from "@/lib/render/canvas";

// מסך כיול הפרומפט — מה שהוא צריך *לפני* שהוא מריץ.
//
// ההרצה עצמה היא `/api/generate` הרגיל, עם `promptOverride`/`rowsOverride`.
// זו כל הנקודה: אין צינור שני שצריך להישאר תואם, יש הבדל אחד מכוון. מה שנשאר
// כאן הוא ההכנה בלבד — לבנות את פרומפט ברירת המחדל לאותן מידות, ולהחזיר את
// הפרופיל שעיצובי הכיול נשמרים תחתיו.

export const maxDuration = 30;

/** הפרופיל שכל עיצובי הכיול נרשמים עליו. `tester` — ולכן `assertDesignAccess`
 *  מתיר אותו מאחורי שער האדמין (מסך הכיול ממילא admin-only), והמכסה היומית
 *  שלו נפרדת משל לקוחות. */
const LAB_PROFILE_NAME = "prompt-debug";
const LAB_PROFILE_COLOR = "#8a5de0";

async function labProfileId(): Promise<string> {
  const sb = supabaseAdmin();
  const found = await sb.from("profiles").select("id").eq("name", LAB_PROFILE_NAME).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (found.data) return (found.data as { id: string }).id;

  const created = await sb
    .from("profiles")
    .insert({ name: LAB_PROFILE_NAME, color: LAB_PROFILE_COLOR, kind: "tester" })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  return (created.data as { id: string }).id;
}

const schema = z.object({
  productType: z.enum(["bracelet", "ring"]).default("bracelet"),
  lengthMm: z.number().positive().max(400).optional(),
  widthMm: z.number().positive().max(100).optional(),
  thicknessMm: z.number().positive().max(5).optional(),
  /** הבריף של הלקוחה — הוא מוטמע בתוך הפרומפט, ולכן הוא חלק ממה שמכיילים. */
  userPrompt: z.string().max(4000).default(""),
  /** עריכה: הפרומפט מדבר על תמונה מצורפת במקום לתאר פריט חדש. */
  editing: z.boolean().default(false),
  /** שורות מפורשות. בלעדיהן — מה ש-planRender גוזר מהיחס. */
  rows: z.number().int().min(1).max(40).optional(),
  /** צורת הקנבס, במקום זו ש-`canvasFor` גוזר מהאורך. אותה עקיפה כמו
   *  ב-`/api/generate`, כדי שהפרומפט שנבנה כאן יהיה זה שיישלח שם. */
  canvas: z.enum(["1536x1024", "1024x1536"]).optional(),
});

export async function POST(req: Request) {
  try {
    requireAdmin(req);
    const body = await parseBody(req, schema);

    const product = FAB.products[body.productType];
    const dims = {
      lengthMm: body.lengthMm ?? product.defaultLengthMm,
      widthMm: body.widthMm ?? product.defaultWidthMm,
      thicknessMm: body.thicknessMm ?? FAB.defaultThicknessMm,
    };

    const minHoleMm = resolveFab(dims.thicknessMm, body.productType).minHole;
    // הקנבס נמסר במפורש כשהמעבדה מבקשת אותו: הוא קובע גם את התקרה (הפתח
    // המינימלי נפרס על גובה השורה) וגם את היחס שהמודל יימשך אליו.
    const canvas = body.canvas ? canvasOf(body.canvas) : canvasFor(dims.lengthMm);
    const plan = planRender({
      ratio: dims.lengthMm / dims.widthMm,
      widthMm: dims.widthMm,
      minHoleMm,
      canvas,
    });
    // שורות מפורשות גוברות על התכנון, **והתקרה מדווחת ולא נאכפת כאן**.
    //
    // עד 17.8 היא נאכפה, ואז הפרומפט שנבנה כאן לא היה זה שנשלח: `/api/generate`
    // מקבל `rowsOverride` כמו שהוא (ראה את ההערה שם), כלומר בקשה ל-2 שורות
    // בפריט רחב הפיקה כאן פרומפט של פריט יחיד וחתכה שם שני פסים. מסך הכיול
    // ממילא מגביל את התיבה ב-`maxRows`, כך שההגנה על הקלדה בשוגג נשארת — ומי
    // ששולח מספר גדול יותר במפורש מקבל בדיוק את מה שההרצה תעשה.
    const cap = maxRows(dims.widthMm, minHoleMm, canvas);
    const rows = body.rows ?? plan.rows;

    return NextResponse.json({
      profileId: await labProfileId(),
      profileName: LAB_PROFILE_NAME,
      dims,
      minHoleMm,
      /** מה שהתכנון היה בוחר לבדו — כדי שהמסך יראה ממה סטית. */
      plannedRows: plan.rows,
      maxRows: cap,
      rows,
      canvas: sizeParam(canvas),
      prompt: buildRenderPrompt(body.userPrompt, body.productType, dims, rows, body.editing),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
