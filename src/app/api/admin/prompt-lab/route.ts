import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/db/supabase";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import { buildRenderPrompt } from "@/lib/llm/imagegen";
import { planRender, maxRows } from "@/lib/render/panels";

// מסך כיול הפרומפט — מה שהוא צריך *לפני* שהוא מריץ.
//
// ההרצה עצמה היא `/api/generate` הרגיל, עם `promptOverride`/`rowsOverride`.
// זו כל הנקודה: אין צינור שני שצריך להישאר תואם, יש הבדל אחד מכוון. מה שנשאר
// כאן הוא ההכנה בלבד — לבנות את פרומפט ברירת המחדל לאותן מידות, ולהחזיר את
// הפרופיל שעיצובי הכיול נשמרים תחתיו.

export const maxDuration = 30;

/** הפרופיל שכל עיצובי הכיול נרשמים עליו. `tester` — ולכן `assertDesignAccess`
 *  מתיר אותו בלי עוגייה, והמכסה היומית שלו נפרדת משל לקוחות. */
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
    const plan = planRender({
      ratio: dims.lengthMm / dims.widthMm,
      widthMm: dims.widthMm,
      minHoleMm,
    });
    // שורות מפורשות גוברות על התכנון — אבל התקרה נשארת, כי היא אינה טעם אלא
    // תקציב פיקסלים: מתחתיה הפתח המינימלי לא שורד את המעקב, והשורה הנוספת
    // מחזירה חלופה שאי אפשר לייצר.
    const cap = maxRows(dims.widthMm, minHoleMm);
    const rows = body.rows ? Math.min(body.rows, cap) : plan.rows;

    return NextResponse.json({
      profileId: await labProfileId(),
      profileName: LAB_PROFILE_NAME,
      dims,
      minHoleMm,
      /** מה שהתכנון היה בוחר לבדו — כדי שהמסך יראה ממה סטית. */
      plannedRows: plan.rows,
      maxRows: cap,
      rows,
      prompt: buildRenderPrompt(body.userPrompt, body.productType, dims, rows, body.editing),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
