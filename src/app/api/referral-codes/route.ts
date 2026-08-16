import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { createReferralCode, listReferralCodes, normalizeCode } from "@/lib/db/referralCodes";

// ניהול קודי ההפניה (0026). אדמין בלבד — הרשימה כוללת מחירים ומכסות.

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    return NextResponse.json({ codes: await listReferralCodes() });
  } catch (err) {
    return handleRouteError(err);
  }
}

const priceSchema = z.number().int().min(0).max(100_000);

const createSchema = z
  .object({
    code: z.string().trim().min(3).max(32),
    label: z.string().trim().min(1).max(120),
    publicLabel: z.string().trim().max(120).optional(),
    kind: z.enum(["fixed_price", "percent_off"]).default("fixed_price"),
    /** מחיר סופי לפריט, כולל מע"מ ואריזה, לפני משלוח. */
    basePrices: z.object({ bracelet: priceSchema, ring: priceSchema }).optional(),
    percentOff: z.number().min(1).max(90).optional(),
    maxUses: z.number().int().positive().max(100_000).optional(),
    expiresAt: z.string().datetime().optional(),
    note: z.string().trim().max(2000).optional(),
  })
  // ה-check constraint של 0026 חוסם את זה ממילא, אבל שגיאת מסד שמגיעה חזרה
  // כ-400 גנרי אינה אומרת לגל *מה* חסר. כאן הוא מקבל את השדה בשמו.
  .refine((v) => (v.kind === "fixed_price" ? v.basePrices != null : v.percentOff != null), {
    message: "fixed_price requires basePrices; percent_off requires percentOff",
  });

export async function POST(req: Request) {
  try {
    requireAdmin(req);
    const body = await parseBody(req, createSchema);
    const fixed = body.kind === "fixed_price";
    const row = await createReferralCode({
      code: normalizeCode(body.code),
      label: body.label,
      public_label: body.publicLabel?.trim() || null,
      kind: body.kind,
      // רק אחד מהשניים נכתב: ה-constraint דורש שהשני יהיה NULL, וקוד שנושא
      // גם מחיר וגם אחוז הוא קוד שאיש לא יידע לפי מה תומחר.
      base_prices: fixed ? (body.basePrices ?? null) : null,
      percent_off: fixed ? null : (body.percentOff ?? null),
      max_uses: body.maxUses ?? null,
      expires_at: body.expiresAt ?? null,
      note: body.note?.trim() || null,
    });
    return NextResponse.json({ code: row }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
