import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addrValid, emailValid } from "../CheckoutScreen";
import type { Addr } from "../model";

// השער של כפתור "שליחת ההזמנה". מה שנבדק כאן הוא מה שמפריד בין הזמנה שאפשר
// לחזור אליה לבין הזמנה שנשמרה עם דרך התקשרות שאינה עובדת.

const OK: Addr = {
  name: "דנה כהן",
  street: "הרצל 14",
  city: "תל אביב",
  zip: "6100001",
  phone: "050-1234567",
  email: "dana@example.com",
};

describe("addrValid", () => {
  it("כתובת מלאה ותקינה עוברת", () => {
    expect(addrValid(OK)).toBe(true);
  });

  it("מיקוד אינו חובה", () => {
    expect(addrValid({ ...OK, zip: "" })).toBe(true);
  });

  it("שדה חובה ריק — או רווחים בלבד — נעצר", () => {
    expect(addrValid({ ...OK, name: "" })).toBe(false);
    expect(addrValid({ ...OK, street: "   " })).toBe(false);
    expect(addrValid({ ...OK, city: "" })).toBe(false);
  });

  it("טלפון שאינו מספר טלפון נעצר, גם כשהשדה מלא", () => {
    expect(addrValid({ ...OK, phone: "0501234" })).toBe(false);
    expect(addrValid({ ...OK, phone: "תתקשרו לבעלי" })).toBe(false);
    expect(addrValid({ ...OK, phone: "6100001" })).toBe(false);
  });

  it("טלפון בכל דרך הקלדה חוקית עובר", () => {
    for (const phone of ["0501234567", "+972 50-123 4567", "03-5551234", "+1 415 555 2671"]) {
      expect(addrValid({ ...OK, phone })).toBe(true);
    }
  });
});

describe("שער השליחה", () => {
  const SCREEN = readFileSync(
    join(process.cwd(), "src/components/create/CheckoutScreen.tsx"),
    "utf8",
  );

  it("אישור התנאים הוא חלק מהשער, ולא רק ממסך הסיכום", () => {
    // האישור ניתן במסך הסיכום, אבל הוא חי ב-state בזיכרון: לשונית שנטענה
    // מחדש מגיעה לצ'קאאוט בלי אישור ועם טופס מלא. התיבה כאן היא גם הראיה
    // שנשמרת בשרת (terms_accepted_at) וגם מה שמונע הזמנה בלעדיה.
    expect(SCREEN).toContain("addrValid(s.addr) && s.terms");
  });

  it("הסכמת הדיוור נפרדת, ולא מסומנת מראש", () => {
    // ברירת המחדל יושבת ב-INITIAL (`marketing: false`), והתיבה אינה נגזרת
    // מ-`terms` בשום מקום — הסכמה לדבר פרסומת אינה נובעת מהזמנה.
    expect(SCREEN).toContain("s.marketing");
    expect(SCREEN).not.toContain("marketing: s.terms");
  });
});

describe("emailValid", () => {
  it("פוסלת כתובת בלי סיומת אמיתית — שם השגיאה שאישור ההזמנה נופל עליה", () => {
    expect(emailValid("dana@example")).toBe(false);
    expect(emailValid("dana@example.c")).toBe(false);
    expect(emailValid("dana example.com")).toBe(false);
    expect(emailValid("dana@example.com")).toBe(true);
    expect(emailValid("  dana@example.co.il  ")).toBe(true);
  });
});
