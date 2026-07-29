import { describe, expect, it } from "vitest";
import { orderItemLines, orderPriceLines, orderSummaryText } from "../orderSummary";
import { orderNotifyMail, orderCustomerAckMail, orderStatusMail } from "../mailTemplates";
import type { OrderRow } from "../db/orders";

const ORDER: OrderRow = {
  id: "00000000-0000-0000-0000-000000000001",
  ref: "RM-0047",
  design_id: "00000000-0000-0000-0000-000000000002",
  version_id: "00000000-0000-0000-0000-000000000003",
  profile_id: null,
  name: "דנה",
  email: "dana@example.com",
  phone: "050-1234567",
  street: "הרצל 5",
  city: "תל אביב",
  zip: "6120101",
  product_type: "bracelet",
  circumference_mm: 170,
  width_mm: 18,
  fit: "regular",
  cuts: 34,
  brief: "עלים מחוברים",
  price: {
    base: 320,
    widthAdd: 0,
    complexity: 45,
    packaging: 25,
    shipping: 35,
    tax: 76,
    total: 501,
  },
  status: "sent",
  status_history: [{ status: "sent", at: "2026-07-28T00:00:00.000Z" }],
  note: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};

describe("סיכום הזמנה", () => {
  it("נגזר מהשורה — כולל המידות והרפרנס", () => {
    const lines = orderItemLines(ORDER).join("\n");
    expect(lines).toContain("170");
    expect(lines).toContain("RM-0047");
    expect(lines).toContain("34");
  });

  it("מוציא את הפירוט ולא רק את הסכום", () => {
    // B2: עד עכשיו נשלח `סה"כ` בלבד, כשהחישוב כבר ידע את כל הרכיבים.
    const lines = orderPriceLines(ORDER).join("\n");
    expect(lines).toContain("₪320");
    expect(lines).toContain("₪45");
    expect(lines).toContain("₪76");
    expect(lines).toContain("₪501");
  });

  it("משמיט רכיב מחיר אפסי, ואת ה'ישיבה' בטבעת", () => {
    expect(orderPriceLines(ORDER).join("\n")).not.toContain("תוספת רוחב");
    const ring: OrderRow = { ...ORDER, product_type: "ring", fit: null };
    expect(orderItemLines(ring).join("\n")).not.toContain("ישיבה");
  });

  it("שומר את שורות הרווח בין הגושים", () => {
    // הבאג שכבר קרה כאן: filter(Boolean) מוחק גם את הפסקאות, וההודעה מגיעה
    // כגוש דחוס אחד.
    expect(orderSummaryText(ORDER)).toContain("\n\n");
  });

  it("מדלג על גוש ריק בלי להשאיר רווח כפול", () => {
    const bare: OrderRow = { ...ORDER, brief: null, street: null, city: null, zip: null, price: null };
    expect(orderSummaryText(bare)).not.toContain("\n\n");
  });
});

describe("מיילים של הזמנה", () => {
  it("ההתראה והאישור נושאים את אותו סיכום בדיוק", () => {
    // שתי גרסאות של אותו סיכום הן שתי הזדמנויות להיבדל.
    const summary = orderSummaryText(ORDER);
    expect(orderNotifyMail(ORDER).text).toContain(summary);
    expect(orderCustomerAckMail(ORDER).text).toContain(summary);
  });

  it("הכותרת נושאת מספר ושם", () => {
    expect(orderNotifyMail(ORDER).subject).toBe("הזמנה חדשה RM-0047 — דנה");
  });

  it("לכל סטטוס שמעניין את הלקוחה יש נוסח, ול-sent אין", () => {
    for (const st of ["approved", "in_production", "shipped", "cancelled"] as const) {
      const mail = orderStatusMail({ ...ORDER, status: st }, st);
      expect(mail).not.toBeNull();
      expect(mail!.subject).toContain("RM-0047");
    }
    // חזרה ל-sent היא תיקון פנימי של גל, לא אירוע שהלקוחה צריכה לשמוע עליו.
    expect(orderStatusMail(ORDER, "sent")).toBeNull();
  });
});
