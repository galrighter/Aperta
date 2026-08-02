import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * העוגייה שהתחדשה באמצע בקשה חייבת לחזור לדפדפן — מכל מסלול, לא רק מ-/api/account.
 *
 * זה לא שיפור נוחות. `refresh_token_rotation_enabled` דלוק בפרויקט, כלומר כל
 * רענון מנפיק refresh token חדש ומפקיע את הקודם תוך עשר שניות. מסלול שביצע
 * רענון ולא החזיר את העוגייה משאיר בדפדפן אסימון מת; השימוש הבא בו נחשב
 * ל-reuse, ו-GoTrue מבטל את הסשן כולו. מבחוץ זה נראה כמו "פתאום העיצוב שלי
 * לא נטען" — 401 על משתמש שלא עשה כלום.
 */

const setAllRef: { fn: ((c: Array<{ name: string; value: string; options?: object }>) => void) | null } = {
  fn: null,
};
let refreshOnRead = true;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: Array<{ name: string; value: string; options?: object }>) => void } },
  ) => {
    setAllRef.fn = opts.cookies.setAll;
    return {
      auth: {
        getUser: async () => {
          // בדיוק מה ש-supabase-js עושה על אסימון שפג: מרענן, ומבקש לכתוב
          // את הסשן החדש דרך מתאם העוגיות.
          if (refreshOnRead) {
            opts.cookies.setAll([
              { name: "sb-test-auth-token", value: "rotated", options: { maxAge: 3600, path: "/" } },
            ]);
          }
          return { data: { user: { id: "auth-1", email: "a@b.co", user_metadata: {} } }, error: null };
        },
      },
    };
  },
}));

vi.mock("@/lib/db/accounts", () => ({
  linkAuthUser: async () => ({ id: "profile-1" }),
}));

const jar: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => {
      // בהקשר שאינו Route Handler (למשל Server Component) הכתיבה זורקת. השם
      // הזה מדמה בדיוק את זה.
      if (name === "throws") throw new Error("Cookies can only be modified in a Route Handler");
      jar.push({ name, value, options });
    },
  }),
}));

const req = () => new Request("https://rmjewel.com/api/designs/x", { headers: { cookie: "sb-test-auth-token=old" } });

beforeEach(() => {
  jar.length = 0;
  refreshOnRead = true;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("readAccountId", () => {
  it("writes the rotated session cookie back to the browser", async () => {
    const { readAccountId } = await import("../account");
    expect(await readAccountId(req())).toBe("profile-1");
    expect(jar.map((c) => [c.name, c.value])).toEqual([["sb-test-auth-token", "rotated"]]);
    expect(jar[0].options).toMatchObject({ path: "/", httpOnly: true, secure: true, maxAge: 3600 });
  });

  it("writes nothing when no refresh happened", async () => {
    refreshOnRead = false;
    const { readAccountId } = await import("../account");
    expect(await readAccountId(req())).toBe("profile-1");
    expect(jar).toEqual([]);
  });

  it("survives a context with no writable cookie store", async () => {
    const { persistAuthCookies } = await import("../supabase/authClient");
    await expect(
      persistAuthCookies([{ name: "throws", value: "y", options: {} }]),
    ).resolves.toBeUndefined();
  });
});
