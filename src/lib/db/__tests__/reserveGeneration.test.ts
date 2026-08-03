import { afterEach, describe, expect, it, vi } from "vitest";

// המכסה נבדקה read-then-act, ולכן N בקשות מקבילות ראו כולן `used < LIMIT`
// והמשיכו — התקרה נחצתה בדיוק כשלוחצים עליה. הבדיקה והרישום עברו לפעולה אחת
// במסד (`reserve_generation`, migration 0017). מה שנשמר כאן הוא הצד שאפשר
// להריץ בלי מסד: תרגום הפסיקה, ומה קורה כשהפונקציה עדיין לא נפרסה.

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  counts: { approved: 0, failed: 0 },
  rpcArgs: null as Record<string, unknown> | null,
}));

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpcArgs = args;
      return db.rpc(name, args);
    },
    // מסלול הנפילה סופר דרך `countTodayRunsByOutcome`, שנשען על שתי שאילתות.
    from: (table: string) => {
      if (table === "designs") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: "d1" }], error: null }) }) };
      }
      const count = (status: "eq" | "neq") =>
        Promise.resolve({ count: status === "eq" ? db.counts.approved : db.counts.failed, error: null });
      return {
        select: () => ({
          in: () => ({
            gte: () => ({ eq: () => count("eq"), neq: () => count("neq") }),
          }),
        }),
      };
    },
  }),
}));

import { reserveGeneration } from "../designs";

const input = {
  runId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  profileId: "9c858901-8a57-4791-81fe-4c455b099bc9",
  approvedLimit: 50,
  failedLimit: 50,
};

afterEach(() => {
  vi.clearAllMocks();
  db.counts = { approved: 0, failed: 0 };
});

describe("שריון מכסה", () => {
  it("מעביר את מזהה ההרצה למסד — זה מה שהופך את השריון ל-idempotent", async () => {
    // בקשה שמתחדשת אחרי ניתוק מגיעה עם אותו מזהה נגזר, ולכן היא לא צורכת
    // יחידה שנייה על הרצה שכבר שולמה.
    db.rpc.mockResolvedValue({ data: "ok", error: null });
    await reserveGeneration(input);
    expect(db.rpcArgs!.p_id).toBe(input.runId);
    expect(db.rpcArgs!.p_profile).toBe(input.profileId);
  });

  it("מחזיר את הפסיקה של המסד כמו שהיא", async () => {
    db.rpc.mockResolvedValue({ data: "approved_limit", error: null });
    expect(await reserveGeneration(input)).toBe("approved_limit");
    db.rpc.mockResolvedValue({ data: "failed_limit", error: null });
    expect(await reserveGeneration(input)).toBe("failed_limit");
  });

  it("פונקציה שעדיין לא נפרסה — חוזרים לספירה במקום לחסום יצירה", async () => {
    // חלון בין הפריסה למיגרציה. תקרה שנחצית תחת מקביליות עדיפה על אתר
    // שאינו מייצר כלום.
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.reserve_generation in the schema cache" },
    });
    db.counts = { approved: 3, failed: 0 };
    expect(await reserveGeneration(input)).toBe("ok");

    db.counts = { approved: 50, failed: 0 };
    expect(await reserveGeneration(input)).toBe("approved_limit");

    db.counts = { approved: 0, failed: 50 };
    expect(await reserveGeneration(input)).toBe("failed_limit");
  });

  it("כשל אחר של המסד נזרק — הוא אינו ראיה לכך שיש מכסה", async () => {
    // fail-open כאן פירושו לתת למסד תקוע לפתוח את התקציב לרווחה.
    db.rpc.mockResolvedValue({ data: null, error: { message: "connection terminated" } });
    await expect(reserveGeneration(input)).rejects.toThrow(/connection terminated/);
  });
});
