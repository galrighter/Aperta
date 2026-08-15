import { describe, it, expect } from "vitest";
import { buildQueue, daysInStatus, isStuck, isUnpaid, statusSince } from "../queue";
import type { OrderRow, OrderStatus } from "@/lib/db/orders";

// תור העבודה עונה על "מה תקוע", ולכן הגיל נמדד מהמעבר לסטטוס הנוכחי. הבאג
// שהבדיקות כאן שומרות עליו: `updated_at` זז בכל עדכון הערה, ואז הזמנה תקועה
// נראית טרייה בדיוק בגלל שמישהו כתב עליה הערה.

const NOW = Date.parse("2026-07-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const order = (over: Partial<OrderRow> = {}): OrderRow =>
  ({
    id: "o1",
    status: "sent" as OrderStatus,
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
    status_history: [{ status: "sent" as OrderStatus, at: daysAgo(30) }],
    ...over,
  }) as OrderRow;

describe("statusSince", () => {
  it("takes the last entry of the current status, not the first", () => {
    // הזמנה שחזרה לסטטוס קודם (תיקון של גל) — מה שקובע הוא המעבר האחרון.
    const o = order({
      status: "approved",
      status_history: [
        { status: "sent", at: daysAgo(20) },
        { status: "approved", at: daysAgo(15) },
        { status: "sent", at: daysAgo(10) },
        { status: "approved", at: daysAgo(1) },
      ],
    });
    expect(statusSince(o)).toBe(daysAgo(1));
  });

  it("falls back to updated_at when the history has no matching entry", () => {
    const o = order({ status: "shipped", status_history: [], updated_at: daysAgo(3) });
    expect(statusSince(o)).toBe(daysAgo(3));
  });
});

describe("daysInStatus", () => {
  it("measures from the status change and not from the order date", () => {
    // הזמנה בת חודש שנשלחה אתמול אינה מאחרת.
    const o = order({
      status: "shipped",
      created_at: daysAgo(30),
      status_history: [
        { status: "sent", at: daysAgo(30) },
        { status: "shipped", at: daysAgo(1) },
      ],
    });
    expect(Math.round(daysInStatus(o, NOW))).toBe(1);
  });

  it("ignores a note edit that touched updated_at", () => {
    const o = order({
      status: "approved",
      status_history: [{ status: "approved", at: daysAgo(9) }],
      updated_at: daysAgo(0),
    });
    expect(Math.round(daysInStatus(o, NOW))).toBe(9);
    expect(isStuck(o, NOW)).toBe(true);
  });
});

describe("isStuck", () => {
  it("uses a different limit per status", () => {
    const at = (status: OrderStatus, days: number) =>
      order({ status, status_history: [{ status, at: daysAgo(days) }] });
    // 3 ימים באישור = תקוע; 3 ימים בייצור = בסדר גמור.
    expect(isStuck(at("approved", 4), NOW)).toBe(true);
    expect(isStuck(at("in_production", 4), NOW)).toBe(false);
    expect(isStuck(at("in_production", 8), NOW)).toBe(true);
  });

  it("never calls a cancelled order stuck", () => {
    const o = order({
      status: "cancelled",
      status_history: [{ status: "cancelled", at: daysAgo(400) }],
    });
    expect(isStuck(o, NOW)).toBe(false);
  });
});

describe("buildQueue", () => {
  const mk = (id: string, status: OrderStatus, days: number) =>
    order({ id, status, status_history: [{ status, at: daysAgo(days) }] });

  it("groups by status in urgency order and drops empty groups", () => {
    const queue = buildQueue([mk("a", "in_production", 1), mk("b", "sent", 1)], NOW);
    expect(queue.map((b) => b.status)).toEqual(["sent", "in_production"]);
  });

  it("puts the longest-waiting order first inside a group", () => {
    const queue = buildQueue([mk("new", "approved", 1), mk("old", "approved", 9)], NOW);
    expect(queue[0].orders.map((o) => o.id)).toEqual(["old", "new"]);
    expect(queue[0].stuck).toBe(1);
  });

  it("keeps cancelled orders out of the queue entirely", () => {
    const queue = buildQueue([mk("x", "cancelled", 1)], NOW);
    expect(queue).toEqual([]);
  });

  it("counts orders that moved forward without a payment mark", () => {
    const queue = buildQueue(
      [
        { ...mk("paid", "approved", 1), paid_at: daysAgo(1) },
        { ...mk("unpaid", "approved", 2), paid_at: null },
        { ...mk("fresh", "sent", 1), paid_at: null },
      ],
      NOW,
    );
    const approved = queue.find((b) => b.status === "approved")!;
    expect(approved.unpaid).toBe(1);
    // הזמנה שרק התקבלה אינה נספרת — היא עוד לא אמורה להיות משולמת.
    expect(queue.find((b) => b.status === "sent")!.unpaid).toBe(0);
  });
});

// סימון התשלום (0022). אין סליקה באתר, ולכן "אושרה אבל לא סומן תשלום" היא
// השאלה היחידה שעומדת בין חיתוך פליז לבין כסף שהתקבל.
describe("isUnpaid", () => {
  const at = (status: OrderStatus, paid_at: string | null = null) =>
    isUnpaid(order({ status, paid_at }));

  it("הזמנה שרק התקבלה אינה 'בלי תשלום' — היא עוד לא אמורה להיות משולמת", () => {
    expect(at("sent")).toBe(false);
  });

  it("מהאישור והלאה — כן", () => {
    expect(at("approved")).toBe(true);
    expect(at("in_production")).toBe(true);
    expect(at("shipped")).toBe(true);
  });

  it("חותמת תשלום מכבה את הסימון בכל שלב", () => {
    expect(at("approved", daysAgo(1))).toBe(false);
    expect(at("shipped", daysAgo(1))).toBe(false);
  });

  it("הזמנה שבוטלה יוצאת מהצינור ואינה נספרת", () => {
    expect(at("cancelled")).toBe(false);
  });
});
