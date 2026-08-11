import { afterEach, describe, expect, it, vi } from "vitest";
import {
  comebackMail, failureSpikeMail, feedbackAckMail, feedbackNotifyMail, notifyMail,
  orderAckMail, stalledJobMail, type InquiryMail,
} from "../mailTemplates";

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

describe("משוב על תקלה חוזרת", () => {
  const FB = {
    name: "דנה",
    email: "dana@example.com",
    designRef: "AP-0054",
    errorShown: "משהו השתבש. נסו שוב. · internal · 500",
    message: "ניסיתי צמיד עם עלים ופעמיים נכשל",
  };

  it("ההתראה לגל נושאת את השגיאה שהוצגה — הראיה שצילום מסך לא נותן", () => {
    const mail = feedbackNotifyMail(FB);
    expect(mail.subject).toContain("דנה");
    expect(mail.text).toContain("internal · 500");
    expect(mail.text).toContain("AP-0054");
    expect(mail.text).toContain(FB.message);
  });

  it("משוב בלי טקסט אינו נראה כשדה שנשבר", () => {
    const mail = feedbackNotifyMail({ ...FB, message: "" });
    expect(mail.text).not.toContain("undefined");
    expect(mail.text).toContain("נשלח בלי טקסט");
  });

  it("האישור למשתמש נושא את קישור ההמשך — הדרך חזרה לעיצוב", () => {
    const url = "https://aperta-designs.com/design?resume=abc";
    const mail = feedbackAckMail({ name: "דנה", code: "AP-0054", url });
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
    expect(mail.subject).toContain("AP-0054");
  });

  it("עובד גם כשהכשל קרה לפני שנוצר עיצוב — בלי מספר, עם קישור למשפך", () => {
    const mail = feedbackAckMail({ name: "דנה", code: null, url: "https://aperta-designs.com/design" });
    expect(mail.subject).not.toContain("null");
    expect(mail.text).toContain("https://aperta-designs.com/design");
  });
});

describe("חזרנו לאוויר", () => {
  it("אומר שהתקלה תוקנה ונושא את קישור ההמשך", () => {
    const url = "https://aperta-designs.com/design?resume=abc";
    const mail = comebackMail({ name: "דנה", code: "AP-0102", url });
    expect(mail.text).toContain("תיקנו את התקלה");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
    expect(mail.text).toContain("AP-0102");
  });

  it("עובד גם לעיצוב בלי מספר", () => {
    const mail = comebackMail({ name: "דנה", code: null, url: "https://aperta-designs.com/design" });
    expect(mail.text).not.toContain("null");
    expect(mail.subject).toContain("חזרנו לאוויר");
  });
});

describe("התראות תקלה", () => {
  it("התראת רצף כשלים נושאת את המספרים ואת הכשל האחרון", () => {
    const mail = failureSpikeMail({
      count: 3, windowMinutes: 15,
      reason: 'rescaleCutoutsSvg: unsupported path command "C"',
      runId: "run-1", designRef: "AP-0102",
    });
    expect(mail.subject).toContain("נכשלות עכשיו");
    expect(mail.text).toContain("3 הרצות");
    expect(mail.text).toContain("rescaleCutoutsSvg");
    expect(mail.text).toContain("/admin/runs");
  });

  it("התראת הרצה תקועה נושאת את הקישור שסוגר אותה בלחיצה", () => {
    const mail = stalledJobMail({ jobId: "job-7", designRef: null });
    expect(mail.text).toContain("actions/workflows/sweep-jobs.yml");
    expect(mail.text).toContain("job-7");
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
