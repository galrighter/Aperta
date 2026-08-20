import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/db/supabase";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { detachSamples, listVersions } from "@/lib/db/designs";
import { hasActiveOrderForDesign } from "@/lib/db/orders";
import { requireDesignAccess } from "@/lib/designAccess";
import { FAB } from "@/lib/fabrication.config";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const versions = await listVersions(id);
    const current = versions.find((v) => v.id === design.current_version_id) ?? null;
    return NextResponse.json({ design, currentVersion: current, versions });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * הגבולות אינם קוסמטיקה: `positive()` בלבד קיבל עובי 0.001, ‏`resolveFab` לא
 * מצא לו שורה בטבלה, ו-`GET /api/orders/[id]` נפל ב-500 על ההזמנה שהצביעה
 * לעיצוב. הטווחים רחבים בכוונה — זה השרת, לא הטופס: התפקיד שלהם לתפוס מספר
 * שאינו מידה בכלל, לא לחזור על הוולידציה של המסך.
 *
 * העובי נצבט לרשימת העוביים הנתמכים, כי אין ביניהם רצף: ‏`byThickness` היא
 * טבלה, וכל ערך שאינו בה הוא ערך שאין לו קבועי ייצור.
 */
const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  lengthMm: z.number().min(20).max(600).optional(),
  widthMm: z.number().min(1).max(100).optional(),
  gapMm: z.number().min(0.5).max(120).optional(),
  thicknessMm: z
    .number()
    .refine((t) => (FAB.supportedThicknessesMm as readonly number[]).includes(t), {
      message: "unsupported thickness",
    })
    .optional(),
  currentVersionId: z.string().uuid().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireDesignAccess(req, id);
    const body = await parseBody(req, patchSchema);
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.lengthMm !== undefined) update.length_mm = body.lengthMm;
    if (body.widthMm !== undefined) update.width_mm = body.widthMm;
    if (body.gapMm !== undefined) update.gap_mm = body.gapMm;
    if (body.thicknessMm !== undefined) update.thickness_mm = body.thicknessMm;
    if (body.currentVersionId !== undefined) {
      // ודא שהגרסה שייכת לעיצוב
      const { data: v, error: vErr } = await supabaseAdmin()
        .from("design_versions")
        .select("id")
        .eq("id", body.currentVersionId)
        .eq("design_id", id)
        .maybeSingle();
      if (vErr) throw new Error(vErr.message);
      if (!v) throw new ApiError("invalid_version", "Version does not belong to design", 400);
      update.current_version_id = body.currentVersionId;
    }
    const { data, error } = await supabaseAdmin()
      .from("designs")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new ApiError("not_found", "Design not found", 404);
    return NextResponse.json({ design: data });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireDesignAccess(req, id);

    // עיצוב שהוזמן אינו נמחק. ‏`design_versions` תלוי ב-`on delete cascade`,
    // וההזמנה ב-`on delete set null` — כלומר המחיקה משאירה את הרישום המסחרי
    // ומשמידה את מה שהוא מצביע עליו: הגרסה שהוזמנה, ה-SVG שלה, וכל דרך לייצא
    // קובץ חיתוך. הזמנה משולמת בלי מה לחתוך.
    //
    // הבדיקה כאן ולא ב-DB: מחיקה שנחסמת ב-FK הייתה 500 סתמי, וכאן יש סיבה
    // שאפשר להציג. ‏`cancelled` אינה חוסמת.
    if (await hasActiveOrderForDesign(id)) {
      throw new ApiError(
        "design_has_order",
        "Design has an active order and cannot be deleted",
        409,
      );
    }

    const sb = supabaseAdmin();
    // exports מפנה גם ל-designs וגם ל-versions בלי cascade — מוחקים קודם
    const { error: exErr } = await sb.from("exports").delete().eq("design_id", id);
    if (exErr) throw new Error(exErr.message);
    // ניתוק ה-FK של הגרסה הנוכחית לפני מחיקת הגרסאות
    const { error: unsetErr } = await sb.from("designs").update({ current_version_id: null }).eq("id", id);
    if (unsetErr) throw new Error(unsetErr.message);
    // הדוגמאות מנותקות ביד: ה-`on delete set null` של ה-FK מרוקן חצי זוג שדות
    // ונופל על `designs_sample_fields_check`. ראה `detachSamples`.
    await detachSamples(id);
    const { error } = await sb.from("designs").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
