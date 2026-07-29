import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * הצעד היחיד בכניסה המאומתת שאי אפשר לתקן בדיעבד.
 *
 * חבר שעיצב בבטא קיים ב-`profiles` לפי מייל, בלי `auth_user_id`. אם הכניסה
 * הראשונה שלו תיצור פרופיל שני, כל העיצובים שלו יישארו תלויים בפרופיל הראשון
 * בלי שום דרך להגיע אליהם — והוא יראה מסך ריק ויחשוב שהם נמחקו.
 */

type Row = {
  id: string;
  name: string;
  color: string;
  kind: string;
  email: string | null;
  phone: string | null;
  auth_user_id?: string | null;
  created_at: string;
  last_seen_at: string;
};

let rows: Row[] = [];
let inserted: Record<string, unknown>[] = [];

/** חיקוי מינימלי של בונה השאילתות של supabase-js, לטבלה אחת בזיכרון. */
function fakeClient() {
  return {
    from() {
      let mode: "select" | "update" | "insert" = "select";
      let patch: Record<string, unknown> = {};
      let filters: Array<[string, unknown]> = [];

      const q = {
        select() {
          return q;
        },
        update(p: Record<string, unknown>) {
          mode = "update";
          patch = p;
          return q;
        },
        insert(p: Record<string, unknown>) {
          mode = "insert";
          inserted.push(p);
          rows.push({ ...(p as unknown as Row), id: `new-${rows.length + 1}` });
          return q;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return q;
        },
        match() {
          return q;
        },
        maybeSingle: async () => ({ data: run() ?? null, error: null }),
        single: async () => ({ data: run(), error: null }),
        // `update(...).eq(...)` בלי select — נצרך כ-thenable.
        then(res: (v: unknown) => unknown) {
          return Promise.resolve({ data: run(), error: null }).then(res);
        },
      };

      function run(): Row | undefined {
        if (mode === "insert") return rows[rows.length - 1];
        const hit = rows.find((r) =>
          filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v),
        );
        if (hit && mode === "update") Object.assign(hit, patch);
        return hit;
      }

      return q;
    },
  };
}

vi.mock("../db/supabase", () => ({ supabaseAdmin: () => fakeClient() }));

let accounts: typeof import("../db/accounts");

const AUTH_ID = "auth-user-1";
const OLD = "2026-01-01T00:00:00.000Z";

beforeEach(async () => {
  rows = [];
  inserted = [];
  accounts = await import("../db/accounts");
});

describe("קישור משתמש מאומת לפרופיל", () => {
  it("מצמיד חשבון קיים מהבטא לפי המייל — ולא יוצר שני", async () => {
    // זה הטסט. הפרופיל קיים מהבטא, בלי auth_user_id.
    rows.push({
      id: "beta-profile",
      name: "דנה",
      color: "#000",
      kind: "friend",
      email: "dana@example.com",
      phone: null,
      auth_user_id: null,
      created_at: OLD,
      last_seen_at: OLD,
    });

    const acc = await accounts.linkAuthUser({
      authUserId: AUTH_ID,
      email: "Dana@Example.com", // אותיות גדולות: המייל מנורמל לפני ההשוואה
      name: "Dana Levi",
    });

    expect(acc.id).toBe("beta-profile");
    expect(inserted).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].auth_user_id).toBe(AUTH_ID);
  });

  it("לא דורס שם קיים בשם שגוגל מסרה", async () => {
    // מי שכתב לעצמו "דנה כ." התכוון לזה.
    rows.push({
      id: "beta-profile",
      name: "דנה כ.",
      color: "#000",
      kind: "friend",
      email: "dana@example.com",
      phone: null,
      auth_user_id: null,
      created_at: OLD,
      last_seen_at: OLD,
    });

    await accounts.linkAuthUser({
      authUserId: AUTH_ID,
      email: "dana@example.com",
      name: "Dana Levi",
    });

    expect(rows[0].name).toBe("דנה כ.");
  });

  it("מוצא חשבון שכבר מקושר בלי לכתוב שוב", async () => {
    rows.push({
      id: "linked",
      name: "דנה",
      color: "#000",
      kind: "friend",
      email: "dana@example.com",
      phone: null,
      auth_user_id: AUTH_ID,
      created_at: OLD,
      last_seen_at: new Date().toISOString(), // נראה לאחרונה עכשיו
    });

    const acc = await accounts.linkAuthUser({ authUserId: AUTH_ID, email: "dana@example.com" });
    expect(acc.id).toBe("linked");
    expect(inserted).toHaveLength(0);
  });

  it("יוצר פרופיל חדש למי שלא היה כאן", async () => {
    const acc = await accounts.linkAuthUser({
      authUserId: AUTH_ID,
      email: "new@example.com",
      name: null,
    });
    expect(inserted).toHaveLength(1);
    expect(acc.email).toBe("new@example.com");
    // בלי שם מגוגל — נופלים על החלק שלפני ה-@, כדי שלא יופיע חשבון בלי שם.
    expect(acc.name).toBe("new");
    expect(acc.kind).toBe("friend");
  });
});
