import { afterEach, describe, expect, it, vi } from "vitest";

// לשונית המשתמשים נשענת על שבעה מקורות שאין ביניהם קשר במסד. מה שנבדק כאן הוא
// בדיוק החלקים שאפשר להריץ בלי מסד, והם גם אלה שקל לשבור בלי לשים לב:
//   · מונח החיפוש נכנס לתוך מחרוזת פילטר עם תחביר משלה.
//   · הספירות נמדדות מול הטבלאות, ולא נספרות מתוך רשימה שקוצצה.
//   · אותה הזמנה מגיעה בשני חוטים (פרופיל ומייל), ואסור שתיספר פעמיים.
//   · מקור שנפל מדווח, ולא נראה כמו "לא היה כלום".

type Filter = [op: string, column: string, value: unknown];

interface Query {
  table: string;
  head: boolean;
  filters: Filter[];
  orders: string[];
}

const db = vi.hoisted(() => ({
  /** מה כל טבלה מחזירה. נדרס בכל בדיקה לפי הצורך. */
  profile: null as Record<string, unknown> | null,
  designs: [] as Array<Record<string, unknown>>,
  designCount: 0,
  versions: [] as Array<Record<string, unknown>>,
  versionCount: 0,
  editCount: 0,
  runs: [] as Array<Record<string, unknown>>,
  failedRunCount: 0,
  ordersByProfile: [] as Array<Record<string, unknown>>,
  ordersByEmail: [] as Array<Record<string, unknown>>,
  inquiries: [] as Array<Record<string, unknown>>,
  exports: [] as Array<Record<string, unknown>>,
  shares: [] as Array<Record<string, unknown>>,
  profilesPage: [] as Array<Record<string, unknown>>,
  profilesTotal: 0,
  designsByProfile: [] as Array<Record<string, unknown>>,
  ordersRows: [] as Array<Record<string, unknown>>,
  /** טבלאות שיחזירו שגיאה, לבדיקת מקור שנפל. */
  broken: new Set<string>(),
  /** כל השאילתות שרצו, לבדיקת מה נשלח בפועל. */
  queries: [] as Query[],
}));

vi.mock("../supabase", () => {
  const has = (q: Query, op: string, column: string) =>
    q.filters.some((f) => f[0] === op && f[1] === column);

  const answer = (q: Query): { data: unknown; count: number | null; error: { message: string } | null } => {
    if (db.broken.has(q.table)) {
      return { data: null, count: null, error: { message: `${q.table} exploded` } };
    }
    const ok = (data: unknown, count: number | null = null) => ({ data, count, error: null });

    switch (q.table) {
      case "profiles":
        // `eq(id)` הוא מסך הפירוט; בלעדיו זו הרשימה.
        return has(q, "eq", "id") ? ok(db.profile) : ok(db.profilesPage, db.profilesTotal);
      case "designs":
        if (q.head) return ok(null, db.designCount);
        // `in(profile_id)` הוא ספירת הרשימה; `eq(profile_id)` הוא מסך הפירוט.
        return has(q, "in", "profile_id") ? ok(db.designsByProfile) : ok(db.designs);
      case "design_versions":
        if (q.head) return ok(null, has(q, "eq", "source") ? db.editCount : db.versionCount);
        return ok(db.versions);
      case "generation_runs":
        if (q.head) return ok(null, db.failedRunCount);
        return ok(db.runs);
      case "orders":
        if (has(q, "in", "profile_id")) return ok(db.ordersRows);
        return ok(has(q, "eq", "email") ? db.ordersByEmail : db.ordersByProfile);
      case "inquiries":
        return ok(db.inquiries);
      case "exports":
        return ok(db.exports);
      case "design_shares":
        return ok(db.shares);
      default:
        return ok([]);
    }
  };

  /** בונה שאילתות מזויף — שרשרת שמסתיימת ב-`await`, כמו ב-supabase-js. */
  const builder = (table: string) => {
    const q: Query = { table, head: false, filters: [], orders: [] };
    db.queries.push(q);
    const api = {
      select(_columns: string, opts?: { head?: boolean }) {
        q.head = opts?.head === true;
        return api;
      },
      eq(column: string, value: unknown) {
        q.filters.push(["eq", column, value]);
        return api;
      },
      neq(column: string, value: unknown) {
        q.filters.push(["neq", column, value]);
        return api;
      },
      in(column: string, value: unknown) {
        q.filters.push(["in", column, value]);
        return api;
      },
      or(expr: string) {
        q.filters.push(["or", expr, null]);
        return api;
      },
      order(column: string) {
        q.orders.push(column);
        return api;
      },
      range() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle: () => Promise.resolve(answer(q)),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(answer(q)).then(res, rej),
    };
    return api;
  };

  return { supabaseAdmin: () => ({ from: builder }) };
});

import { getUserActivity, listUsersForAdmin, searchTerm } from "../users";

const USER = {
  id: "u1",
  name: "דנה כ.",
  color: "#4d8fe0",
  kind: "friend",
  email: "dana@example.com",
  phone: "050-0000000",
  created_at: "2026-01-01T09:00:00.000Z",
  last_seen_at: "2026-08-01T09:00:00.000Z",
};

afterEach(() => {
  db.profile = null;
  db.designs = [];
  db.designCount = 0;
  db.versions = [];
  db.versionCount = 0;
  db.editCount = 0;
  db.runs = [];
  db.failedRunCount = 0;
  db.ordersByProfile = [];
  db.ordersByEmail = [];
  db.inquiries = [];
  db.exports = [];
  db.shares = [];
  db.profilesPage = [];
  db.profilesTotal = 0;
  db.designsByProfile = [];
  db.ordersRows = [];
  db.broken.clear();
  db.queries = [];
  vi.clearAllMocks();
});

describe("ניקוי מונח החיפוש", () => {
  it("מסיר את תווי התחביר של PostgREST", () => {
    // פסיק מפריד בין תנאים, סוגריים מקבצים, וכוכבית היא התו הכללי. ערך שמכיל
    // אותם אינו "חיפוש שלא מוצא" אלא שאילתה אחרת.
    expect(searchTerm('a,b(c)*d%e"f')).toBe("a b c d e f");
  });

  it("מחרוזת שכולה תווי תחביר אינה חיפוש", () => {
    expect(searchTerm("  ,,() ")).toBeNull();
  });

  it("שם רגיל עובר כמו שהוא", () => {
    expect(searchTerm("  דנה כהן  ")).toBe("דנה כהן");
  });
});

describe("רשימת המשתמשים", () => {
  it("ממיינת לפי תאריך הרשמה כברירת מחדל, ולפי פעילות אחרונה כשמבקשים", async () => {
    db.profilesPage = [USER];
    db.profilesTotal = 1;

    await listUsersForAdmin({ limit: 25, offset: 0 });
    expect(db.queries.find((q) => q.table === "profiles")!.orders[0]).toBe("created_at");

    db.queries = [];
    await listUsersForAdmin({ limit: 25, offset: 0, sort: "active" });
    expect(db.queries.find((q) => q.table === "profiles")!.orders[0]).toBe("last_seen_at");
  });

  it("שולחת את מונח החיפוש מנוקה, ולא כמו שהתקבל", async () => {
    db.profilesPage = [USER];
    db.profilesTotal = 1;
    await listUsersForAdmin({ limit: 25, offset: 0, q: "dana,email.eq.gal" });

    const or = db.queries
      .find((q) => q.table === "profiles")!
      .filters.find((f) => f[0] === "or")![1];
    // שלושה תנאים בדיוק (שם, מייל, טלפון) — ולא ארבעה שהוזרקו דרך פסיק.
    expect(or.split(",").length).toBe(3);
    expect(or).toContain("dana email.eq.gal");
  });

  it("מצרפת לכל משתמש את מספר העיצובים וההזמנות שלו", async () => {
    db.profilesPage = [USER, { ...USER, id: "u2" }];
    db.profilesTotal = 2;
    db.designsByProfile = [{ profile_id: "u1" }, { profile_id: "u1" }, { profile_id: "u2" }];
    db.ordersRows = [{ profile_id: "u2" }];

    const { users, total } = await listUsersForAdmin({ limit: 25, offset: 0 });
    expect(total).toBe(2);
    expect(users[0]).toMatchObject({ id: "u1", designs: 2, orders: 0 });
    expect(users[1]).toMatchObject({ id: "u2", designs: 1, orders: 1 });
  });

  it("טבלה שנפלה מאפסת את הספירה ולא את הרשימה", async () => {
    // `orders` היא מיגרציה 0011. במסד שלא קיבל אותה הרשימה עדיין צריכה להיטען.
    db.profilesPage = [USER];
    db.profilesTotal = 1;
    db.broken.add("orders");

    const { users } = await listUsersForAdmin({ limit: 25, offset: 0 });
    expect(users).toHaveLength(1);
    expect(users[0].orders).toBe(0);
  });
});

describe("הפעילות של משתמש", () => {
  const withDesigns = () => {
    db.profile = USER;
    db.designs = [
      {
        id: "d1",
        serial: 7,
        root_serial: null,
        sample_no: null,
        name: "גלים",
        product_type: "bracelet",
        created_at: "2026-03-01T10:00:00.000Z",
      },
    ];
    db.designCount = 1;
  };

  it("מחזיר null על מזהה שאינו קיים", async () => {
    expect(await getUserActivity("nope")).toBeNull();
  });

  it("מאחד את כל המקורות לציר אחד, החדש קודם", async () => {
    withDesigns();
    db.versions = [
      {
        id: "v1",
        design_id: "d1",
        version_no: 2,
        source: "edit",
        validation_status: "pass",
        created_at: "2026-03-01T12:00:00.000Z",
      },
    ];
    db.runs = [
      {
        id: "r1",
        design_id: "d1",
        status: "error",
        error: "quota",
        prompt: "גלים",
        created_at: "2026-03-01T11:00:00.000Z",
      },
    ];
    db.inquiries = [
      {
        id: "q1",
        kind: "contact",
        status: "new",
        message: "שאלה",
        created_at: "2026-03-02T08:00:00.000Z",
      },
    ];

    const activity = (await getUserActivity("u1"))!;
    expect(activity.events.map((e) => e.kind)).toEqual([
      "inquiry",
      "version",
      "run_failed",
      "design_created",
    ]);
    // הרפרנס האנושי, ולא ה-uuid: תלונה מגיעה עם `AP-0007`.
    expect(activity.events[1].design?.code).toBe("AP-0007");
  });

  it("סופר הזמנה שמגיעה גם לפי הפרופיל וגם לפי המייל פעם אחת", async () => {
    withDesigns();
    const order = {
      id: "o1",
      ref: "AP-0007",
      design_id: "d1",
      status: "sent",
      price: { total: 399 },
      created_at: "2026-04-01T10:00:00.000Z",
    };
    db.ordersByProfile = [order];
    db.ordersByEmail = [order];

    const activity = (await getUserActivity("u1"))!;
    expect(activity.events.filter((e) => e.kind === "order")).toHaveLength(1);
    expect(activity.counts.orders).toBe(1);
  });

  it("הספירות נמדדות מול הטבלאות ולא נספרות מתוך הרשימה שקוצצה", async () => {
    // זו ההבחנה שהמסך עומד עליה: יומן שמציג 1 מתוך 12 כשלים עדיין חייב לומר 12.
    withDesigns();
    db.runs = [
      {
        id: "r1",
        design_id: "d1",
        status: "rejected",
        error: null,
        prompt: null,
        created_at: "2026-03-01T11:00:00.000Z",
      },
    ];
    db.failedRunCount = 12;
    db.versionCount = 30;
    db.editCount = 9;

    const activity = (await getUserActivity("u1", 1))!;
    expect(activity.events).toHaveLength(1);
    expect(activity.truncated).toBe(true);
    expect(activity.counts).toMatchObject({ failedRuns: 12, versions: 30, edits: 9 });
  });

  it("מסמן שהספירות התלויות-עיצוב מדברות על חלק מהעיצובים", async () => {
    withDesigns();
    db.designCount = 500; // יותר ממה שנמשך לצורך ה-join

    const activity = (await getUserActivity("u1"))!;
    expect(activity.designsTruncated).toBe(true);
    expect(activity.counts.designs).toBe(500);
  });

  it("מקור שנפל מדווח, ושאר היומן נטען", async () => {
    withDesigns();
    db.broken.add("exports");
    db.inquiries = [
      {
        id: "q1",
        kind: "contact",
        status: "new",
        message: "שאלה",
        created_at: "2026-03-02T08:00:00.000Z",
      },
    ];

    const activity = (await getUserActivity("u1"))!;
    expect(activity.problems).toContain("exports");
    expect(activity.events.map((e) => e.kind)).toContain("inquiry");
  });

  it("בלי עיצובים אין שאילתות תלויות-עיצוב", async () => {
    db.profile = { ...USER, email: null };
    db.designCount = 0;

    const activity = (await getUserActivity("u1"))!;
    expect(activity.events).toEqual([]);
    // `in ()` ריק הוא שאילתה מיותרת שמחזירה כלום.
    expect(db.queries.some((q) => q.table === "design_versions")).toBe(false);
    expect(db.queries.some((q) => q.table === "generation_runs")).toBe(false);
    // בלי מייל אין חוט לפניות, ולכן גם אותן לא שואלים.
    expect(db.queries.some((q) => q.table === "inquiries")).toBe(false);
  });
});
