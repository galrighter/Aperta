import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError } from "@/lib/api";
import {
  ACCOUNT_MAX_AGE,
  accountCookieHeader,
  accountCookieValue,
  readAccountId,
} from "@/lib/account";
import { getAccount, signIn, toPublic } from "@/lib/db/accounts";

// החשבון של המבקר. GET = מי אני, POST = כניסה/הרשמה, DELETE = החלפת משתמש.

export async function GET(req: Request) {
  try {
    const id = await readAccountId(req);
    if (!id) return NextResponse.json({ account: null });
    const account = await getAccount(id);
    // עוגייה חתומה שמצביעה לחשבון שנמחק — מנקים אותה במקום להחזיר 500.
    if (!account) {
      const res = NextResponse.json({ account: null });
      res.headers.set("Set-Cookie", accountCookieHeader("", 0));
      return res;
    }
    return NextResponse.json({ account: toPublic(account) });
  } catch (err) {
    return handleRouteError(err);
  }
}

const signInSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  // honeypot — אותו דפוס כמו ב-/api/inquiries
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, signInSchema);

    // בוט: מחזירים הצלחה בלי חשבון ובלי עוגייה. אין כאן מה לזייף — הזרימה
    // תבקש זיהוי שוב, ושום שורה לא נכתבה.
    if (body.company) return NextResponse.json({ account: null }, { status: 201 });

    const account = await signIn({
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
    });
    const res = NextResponse.json({ account: toPublic(account) }, { status: 201 });
    res.headers.set(
      "Set-Cookie",
      accountCookieHeader(await accountCookieValue(account.id), ACCOUNT_MAX_AGE),
    );
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", accountCookieHeader("", 0));
  return res;
}
