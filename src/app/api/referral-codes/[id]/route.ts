import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { setReferralCodeActive } from "@/lib/db/referralCodes";

// הדלקה/כיבוי של קוד. אין כאן DELETE בכוונה: הזמנות מצביעות על השורה הזאת
// כדי להסביר למה נגבה בהן מה שנגבה, ומחיקה הייתה מותירה אותן בלי הסבר.

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    return NextResponse.json({ code: await setReferralCodeActive(id, body.active) });
  } catch (err) {
    return handleRouteError(err);
  }
}
