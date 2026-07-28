import { beforeAll, describe, expect, it, vi } from "vitest";

// הסוד נקבע לפני הטעינה — המפתח נגזר פעם אחת ונשמר במודול.
process.env.ACCOUNT_SECRET = "test-secret-for-account-cookies";

const OWNER = "8f14e45f-ceea-4c7f-9c47-1a2b3c4d5e6f";
const STRANGER = "00000000-0000-4000-8000-000000000000";
const TESTER = "11111111-1111-4111-8111-111111111111";

// שני מסלולי הבעלות בפועל: פרופיל בודק (הסטודיו הפנימי, אין לו חשבון) מול
// פרופיל של חבר שנרשם באתר.
const PROFILES: Record<string, { id: string; kind: string }> = {
  [OWNER]: { id: OWNER, kind: "friend" },
  [STRANGER]: { id: STRANGER, kind: "friend" },
  [TESTER]: { id: TESTER, kind: "tester" },
};

vi.mock("../db/accounts", () => ({
  getAccount: async (id: string) => PROFILES[id] ?? null,
}));
vi.mock("../db/designs", () => ({
  getDesign: async (id: string) => ({ id, profile_id: id === "studio-design" ? TESTER : OWNER }),
}));

let access: typeof import("../designAccess");
let account: typeof import("../account");

beforeAll(async () => {
  access = await import("../designAccess");
  account = await import("../account");
});

async function reqAs(profileId: string | null): Promise<Request> {
  if (!profileId) return new Request("https://rmjewel.com/");
  const cookie = await account.accountCookieValue(profileId);
  return new Request("https://rmjewel.com/", {
    headers: { cookie: `${account.ACCOUNT_COOKIE}=${encodeURIComponent(cookie)}` },
  });
}

describe("בעלות על עיצוב קיים", () => {
  it("מכבדת את הבעלים", async () => {
    await expect(access.requireDesignAccess(await reqAs(OWNER), "d1")).resolves.toMatchObject({
      profile_id: OWNER,
    });
  });

  it("חוסמת חשבון אחר — זה כל הטעם", async () => {
    // מזהה עיצוב אינו סוד: הוא עובר בכתובות, ביומנים ובקישורים. בלי הבדיקה
    // הזו די היה בו כדי לקרוא עיצוב של חבר, לשנות אותו, או להריץ עליו יצירה
    // על חשבון המכסה והתקציב של בעליו.
    await expect(access.requireDesignAccess(await reqAs(STRANGER), "d1")).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("חוסמת בקשה בלי חשבון בכלל", async () => {
    await expect(access.requireDesignAccess(await reqAs(null), "d1")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("משאירה את הסטודיו הפנימי פתוח — לעיצוב של בודק אין חשבון", async () => {
    // הסטודיו נכנס בלי עוגייה, ולכן הוא מזוהה דרך הבעלים של העיצוב עצמו.
    // אילו הבדיקה הייתה נשענת על `profileId` שהלקוח שולח, היה אפשר לזייף אותו.
    await expect(
      access.requireDesignAccess(await reqAs(null), "studio-design"),
    ).resolves.toMatchObject({ profile_id: TESTER });
  });

  it("חוסמת עיצוב בלי בעלים", async () => {
    await expect(access.assertDesignAccess(await reqAs(OWNER), null)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
