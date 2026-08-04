import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyMail, orderAckMail, type InquiryMail } from "../mailTemplates";

const ORDER: InquiryMail = {
  kind: "order",
  name: "דנה",
  email: "dana@example.com",
  phone: "050-1234567",
  message: "מוצר: צמיד\nהיקף: 170 מ\"מ\nסה\"כ: ₪290",
  orderRef: "AP-0047",
};

describe("מייל התראה", () => {
  it("נושא את מספר ההזמנה ואת השם בכותרת", () => {
    // הכותרת היא לעיתים כל מה שנקרא — ברשימת המיילים בנייד.
    expect(notifyMail(ORDER).subject).toBe("הזמנה חדשה AP-0047 — דנה");
  });

  it("מבדיל פנייה מהזמנה", () => {
    expect(notifyMail({ ...ORDER, kind: "contact" }).subject).toContain("פנייה חדשה");
  });

  it("משמיט שדה חסר בלי למחוק את שורות הרווח", () => {
    // הבאג המתבקש כאן הוא filter על מחרוזת ריקה: הוא מוחק גם את הפסקאות,
    // וההודעה מגיעה כגוש אחד דחוס.
    const noPhone = notifyMail({ ...ORDER, phone: null }).text;
    expect(noPhone).not.toContain("טלפון");
    expect(noPhone).toContain("\n\n");
  });

  it("שומר את גוף הפנייה כמו שהוא", () => {
    expect(notifyMail(ORDER).text).toContain(ORDER.message);
  });
});

describe("אישור ללקוחה", () => {
  it("נושא את מספר ההזמנה", () => {
    const mail = orderAckMail(ORDER);
    expect(mail.subject).toContain("AP-0047");
    expect(mail.text).toContain("AP-0047");
  });

  it("חוזר על אותו סיכום בדיוק — לא ניסוח שני", () => {
    // שתי גרסאות של אותו סיכום הן שתי הזדמנויות להיבדל זו מזו.
    expect(orderAckMail(ORDER).text).toContain(ORDER.message);
  });

  it("עובד גם בלי מספר הזמנה", () => {
    const mail = orderAckMail({ ...ORDER, orderRef: null });
    expect(mail.subject).not.toContain("undefined");
    expect(mail.text).not.toContain("null");
  });
});

describe("הגדרת הספק", () => {
  afterEach(() => {
    delete process.env.RESEND_API;
    delete process.env.RESEND_API_KEY;
    vi.resetModules();
  });

  async function configured(): Promise<boolean> {
    vi.resetModules();
    return (await import("../mail")).mailConfigured();
  }

  it("מזהה שאין ספק", async () => {
    expect(await configured()).toBe(false);
  });

  it("מקבל את השם שהוגדר בריפו", async () => {
    process.env.RESEND_API = "re_test_key_value";
    expect(await configured()).toBe(true);
  });

  it("מקבל גם את השם המקובל", async () => {
    // סוד שקיים תחת RESEND_API_KEY לא צריך להיראות כמו ספק שלא הוקם — זו
    // תקלה שנראית בדיוק כמו באג בקוד השליחה.
    process.env.RESEND_API_KEY = "re_test_key_value";
    expect(await configured()).toBe(true);
  });
});
