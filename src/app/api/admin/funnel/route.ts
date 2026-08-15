import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { funnelSummary } from "@/lib/db/funnel";

// סיכום המשפך לבק־אופיס. אדמין בלבד — אלה מספרי העסק.

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const raw = Number(new URL(req.url).searchParams.get("days"));
    // 1–90. מחוץ לטווח נופל ל-7 ולא ל-שגיאה: זה פרמטר של מסך, לא של חוזה.
    const days = Number.isFinite(raw) && raw >= 1 && raw <= 90 ? Math.floor(raw) : 7;
    return NextResponse.json(await funnelSummary(days));
  } catch (err) {
    return handleRouteError(err);
  }
}
