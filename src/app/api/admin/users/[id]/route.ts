import { NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { getUserActivity, DEFAULT_EVENT_LIMIT, MAX_EVENT_LIMIT } from "@/lib/db/users";

// הפעילות של משתמש אחד: מה יצר, מה ערך, מה נכשל, מה הזמין ומה שאל.
//
// 404 ולא רשימה ריקה על מזהה שאינו קיים: מסך שנפתח על משתמש שנמחק צריך לומר
// "לא נמצא", לא "אין פעילות" — השניים נראים אותו דבר ומשמעותם הפוכה.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(
      MAX_EVENT_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_EVENT_LIMIT),
    );

    const activity = await getUserActivity(id, limit);
    if (!activity) throw new ApiError("not_found", "User not found", 404);
    return NextResponse.json(activity);
  } catch (err) {
    return handleRouteError(err);
  }
}
