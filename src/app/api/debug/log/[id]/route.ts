import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { getRun } from "@/lib/db/runs";

// הפירוט המלא של הרצה אחת — ה-SVG הסופי וה-SVG של כל 13 המועמדים.
// נטען רק כשפותחים הרצה ביומן, כדי שהרשימה תישאר קלה.

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await getRun(id);
    if (!row) throw new ApiError("not_found", `Run ${id} not found`, 404);
    return NextResponse.json({ id: row.id, svg: row.svg, debug: row.debug });
  } catch (err) {
    return handleRouteError(err);
  }
}
