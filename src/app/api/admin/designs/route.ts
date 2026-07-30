import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { listDesignsForAdmin } from "@/lib/db/accounts";

// "מי עיצב מה" — הרשימה של הבק־אופיס. מאחורי requireAdmin: כאן יושבים
// השמות, המיילים והעיצובים של כל מי שנרשם.

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const { designs, total } = await listDesignsForAdmin(limit, offset);
    return NextResponse.json({ designs, total, limit, offset });
  } catch (err) {
    return handleRouteError(err);
  }
}
