import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { listUsersForAdmin, USER_SORTS, type UserSort } from "@/lib/db/users";
import type { AccountKind } from "@/lib/db/accounts";

// רשימת המשתמשים לבק־אופיס: חיפוש, מיון, ועימוד. מאחורי requireAdmin — כאן
// יושבים השמות, המיילים והטלפונים של כל מי שנרשם.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const KINDS: AccountKind[] = ["friend", "tester"];

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url);

    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    // פרמטר לא מוכר נופל לברירת המחדל ולא לשגיאה: הוא מגיע מכתובת שאפשר
    // לערוך ביד, ומסך ניהול שנשבר מכתובת שגויה הוא מסך שאי אפשר לשלוח בלינק.
    const rawSort = url.searchParams.get("sort");
    const sort: UserSort = USER_SORTS.includes(rawSort as UserSort)
      ? (rawSort as UserSort)
      : "created";
    const rawKind = url.searchParams.get("kind");
    const kind = KINDS.includes(rawKind as AccountKind) ? (rawKind as AccountKind) : null;

    const { users, total } = await listUsersForAdmin({
      q: url.searchParams.get("q"),
      sort,
      kind,
      limit,
      offset,
    });
    return NextResponse.json({ users, total, limit, offset, sort, kind });
  } catch (err) {
    return handleRouteError(err);
  }
}
