import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError, ApiError } from "@/lib/api";
import { checkAdminToken, adminConfigured, adminCookieHeader, requireAdmin } from "@/lib/admin";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";

const loginSchema = z.object({ token: z.string().min(1).max(500) });

const WEEK = 7 * 24 * 60 * 60;
/** ניחוש הסוד — 10 ניסיונות ל-10 דקות לכל IP. עוצר brute-force מקוון על ה-token. */
const LOGIN_WINDOW_MS = 10 * 60_000;
const LOGIN_MAX = 10;

/** "האם אני מחובר?" — 200 / 401 / 503, בלי גוף ובלי לגעת במסד.
 *  קיים כדי שעמוד מוגן יוכל להחליט אם להציג טופס כניסה בלי למשוך קודם את
 *  המידע שהוא מגן עליו. */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    if (!adminConfigured()) {
      throw new ApiError("admin_disabled", "Admin is not configured (set ADMIN_TOKEN)", 503);
    }
    if (await tooManyAttempts(`admin_login:${clientIp(req)}`, LOGIN_WINDOW_MS, LOGIN_MAX)) {
      throw new ApiError("rate_limited", "Too many attempts, try again later", 429);
    }
    const body = await parseBody(req, loginSchema);
    if (!checkAdminToken(body.token)) {
      throw new ApiError("unauthorized", "Invalid token", 401);
    }
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", adminCookieHeader(body.token, WEEK));
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", adminCookieHeader("", 0));
  return res;
}
