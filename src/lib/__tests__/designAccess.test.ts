import { beforeAll, describe, expect, it, vi } from "vitest";

// הסוד נקבע לפני הטעינה — המפתח נגזר פעם אחת ונשמר במודול.
process.env.ACCOUNT_SECRET = "test-secret-for-account-cookies";
// גישה לעיצוב בודק דורשת עכשיו עוגיית אדמין (שער הסטודיו הפנימי).
process.env.ADMIN_TOKEN = "test-admin-token-value";

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

// הזהות עצמה נבדקת במקום אחר. כאן מזייפים אותה כדי לבדוק את כלל הבעלות
// לבדו — קודם הטסט בנה עוגייה חתומה, וזה קשר אותו למנגנון שהוחלף מאז
// ב-Supabase Auth. מה שנבדק כאן לא היה תלוי בו מלכתחילה.
let signedInAs: string | null = null;
vi.mock("../account", async () => {
  const { ApiError } = await import("../api");
  return {
    readAccountId: async () => signedInAs,
    requireAccountId: async () => {
      if (!signedInAs) throw new ApiError("account_required", "Sign in before designing", 401);
      return signedInAs;
    },
  };
});

let access: typeof import("../designAccess");

beforeAll(async () => {
  access = await import("../designAccess");
});

async function reqAs(profileId: string | null, opts?: { admin?: boolean }): Promise<Request> {
  signedInAs = profileId;
  const headers: Record<string, string> = {};
  if (opts?.admin) headers.cookie = `aperta_admin=${process.env.ADMIN_TOKEN}`;
  return new Request("https://rmjewel.com/", { headers });
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

  it("פותחת עיצוב בודק כשיש עוגיית אדמין — זה מסלול הסטודיו הפנימי", async () => {
    // הסטודיו נכנס בלי חשבון-לקוח, אבל מאחורי שער האדמין: העוגייה נלווית
    // לבקשה. אילו הבדיקה נשענה על `profileId` שהלקוח שולח, היה אפשר לזייף אותו.
    await expect(
      access.requireDesignAccess(await reqAs(null, { admin: true }), "studio-design"),
    ).resolves.toMatchObject({ profile_id: TESTER });
  });

  it("חוסמת עיצוב בודק בלי עוגיית אדמין — הפרצה שנסגרה", async () => {
    // בלי השער הזה כל אנונימי שהחזיק מזהה עיצוב בודק יכול היה לקרוא/למחוק/לייצר
    // עליו. עכשיו זו דרישת אדמין, לא דלת פתוחה.
    await expect(
      access.requireDesignAccess(await reqAs(null), "studio-design"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("חוסמת עיצוב בלי בעלים", async () => {
    await expect(access.assertDesignAccess(await reqAs(OWNER), null)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
