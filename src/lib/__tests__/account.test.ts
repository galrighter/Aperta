import { beforeAll, describe, expect, it } from "vitest";

// הסוד נקבע לפני הטעינה — המפתח נגזר פעם אחת ונשמר במודול.
process.env.ACCOUNT_SECRET = "test-secret-for-account-cookies";

let mod: typeof import("../account");

beforeAll(async () => {
  mod = await import("../account");
});

const ID = "8f14e45f-ceea-4c7f-9c47-1a2b3c4d5e6f";

function reqWithCookie(value: string): Request {
  return new Request("https://rmjewel.com/", { headers: { cookie: value } });
}

describe("עוגיית החשבון", () => {
  it("קוראת בחזרה את המזהה שנחתם", async () => {
    const cookie = await mod.accountCookieValue(ID);
    const req = reqWithCookie(`${mod.ACCOUNT_COOKIE}=${encodeURIComponent(cookie)}`);
    expect(await mod.readAccountId(req)).toBe(ID);
  });

  it("דוחה מזהה שהוחלף תחת חתימה תקפה", async () => {
    // זה כל הטעם בחתימה: מזהי פרופיל אינם סוד, ובלעדיה די היה בלהחליף uuid
    // בעוגייה כדי לעצב בשם מישהו אחר.
    const cookie = await mod.accountCookieValue(ID);
    const sig = cookie.slice(cookie.lastIndexOf(".") + 1);
    const other = "00000000-0000-4000-8000-000000000000";
    const req = reqWithCookie(`${mod.ACCOUNT_COOKIE}=${encodeURIComponent(`${other}.${sig}`)}`);
    expect(await mod.readAccountId(req)).toBeNull();
  });

  it("דוחה חתימה שהשתנתה", async () => {
    const cookie = await mod.accountCookieValue(ID);
    const req = reqWithCookie(`${mod.ACCOUNT_COOKIE}=${encodeURIComponent(`${cookie}x`)}`);
    expect(await mod.readAccountId(req)).toBeNull();
  });

  it("מחזירה null בלי עוגייה, וקוראת אותה גם לצד עוגיות אחרות", async () => {
    expect(await mod.readAccountId(new Request("https://rmjewel.com/"))).toBeNull();
    const cookie = await mod.accountCookieValue(ID);
    const req = reqWithCookie(
      `other=1; ${mod.ACCOUNT_COOKIE}=${encodeURIComponent(cookie)}; forme_admin=zzz`,
    );
    expect(await mod.readAccountId(req)).toBe(ID);
  });

  it("requireAccountId זורק 401 כשאין חשבון", async () => {
    await expect(mod.requireAccountId(new Request("https://rmjewel.com/"))).rejects.toMatchObject({
      code: "account_required",
      status: 401,
    });
  });

  it("העוגייה HttpOnly ו-Secure", async () => {
    const header = mod.accountCookieHeader(await mod.accountCookieValue(ID), mod.ACCOUNT_MAX_AGE);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
  });
});
