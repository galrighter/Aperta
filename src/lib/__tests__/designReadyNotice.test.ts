import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DesignRow } from "../db/designs";

// המייל "העיצוב שלך מוכן" נשלח משני מסלולים: ה-POST שסיים את היצירה, ומסלול
// ההתאוששות שמוצא גרסה שנשמרה אחרי שה-isolate נהרג (RM-0084). מה שנבדק כאן הוא
// שהתנאי "גרסה ראשונה" נשאל כפרמטר — כי בכל מסלול העדות עליו שונה, ובמסלול
// ההתאוששות קריאת `current_version_id` הייתה משתיקה את המייל תמיד.

const sendMail = vi.fn();
const getAccount = vi.fn();
const mailConfigured = vi.fn(() => true);

vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailConfigured: () => mailConfigured(),
}));
vi.mock("@/lib/db/accounts", () => ({ getAccount: (...a: unknown[]) => getAccount(...a) }));

const { notifyDesignReady } = await import("../designReadyNotice");

const design = {
  id: "d-1",
  profile_id: "p-1",
  serial: 84,
  current_version_id: "v-1",
} as unknown as DesignRow;

beforeEach(() => {
  vi.clearAllMocks();
  mailConfigured.mockReturnValue(true);
  sendMail.mockResolvedValue({ ok: true });
  getAccount.mockResolvedValue({ id: "p-1", name: "דנה", kind: "friend", email: "d@example.com" });
});

describe("notifyDesignReady", () => {
  it("sends when the caller says this is the first version", async () => {
    await notifyDesignReady(design, true);
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "d@example.com" });
  });

  it("stays silent when the caller says it is an edit", async () => {
    await notifyDesignReady(design, false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  /**
   * זה הטסט שמגן על התיקון. `design.current_version_id` מלא — כפי שהוא תמיד
   * במסלול ההתאוששות, כי הגרסה כבר נשמרה. אם הפונקציה תחזור להסיק את התנאי
   * מהשדה במקום מהפרמטר, המייל ייחסם בדיוק במסלול שנועד להחזיר אותו.
   */
  it("ignores current_version_id and trusts the caller's evidence", async () => {
    expect(design.current_version_id).toBeTruthy();
    await notifyDesignReady(design, true);
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("stays silent for a tester profile — that is the internal studio", async () => {
    getAccount.mockResolvedValue({ id: "p-1", name: "בודק", kind: "tester", email: "t@example.com" });
    await notifyDesignReady(design, true);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("stays silent with no recipient", async () => {
    getAccount.mockResolvedValue({ id: "p-1", name: "דנה", kind: "friend", email: null });
    await notifyDesignReady(design, true);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("stays silent when mail is not configured", async () => {
    mailConfigured.mockReturnValue(false);
    await notifyDesignReady(design, true);
    expect(sendMail).not.toHaveBeenCalled();
  });

  // ההתראה לעולם לא מפילה את הבקשה: היצירה הצליחה ונשמרה, והכיוון ההפוך היה
  // מציג "היצירה נכשלה" על עיצוב שקיים.
  it("never throws when the mail layer fails", async () => {
    sendMail.mockRejectedValue(new Error("smtp down"));
    await expect(notifyDesignReady(design, true)).resolves.toBeUndefined();
  });
});
