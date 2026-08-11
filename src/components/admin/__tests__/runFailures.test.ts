import { describe, it, expect } from "vitest";
import { noOutcome, sameFailure } from "@/components/admin/RunsLog";
import { describeFailure } from "@/lib/db/runs";

// AP-0096, 10.8: שלוש הרצות רצופות נרשמו ביומן כ-"approved · אין שגיאה", אף
// אחת מהן לא הולידה גרסה, והלקוחה לא ראתה כלום. הכשל האמיתי
// (`rescaleCutoutsSvg: unsupported path command "C"`) ישב על שורת ה-job בלבד:
// הסטטוס בשורה הוא הפסיקה של הווקטורייזר על הפאנל, לא תוצאת היצירה, וכל מה
// שנכשל אחריה לא נגע בה. הטסט שומר על שני החצאים של התשובה — מה שמוצג ומה
// שנכתב.

describe("a run that ended in nothing", () => {
  const failed = { code: "internal", message: "rescaleCutoutsSvg: unsupported path command \"C\"", status: "error" };

  it("is flagged when it looks approved but saved no version", () => {
    expect(noOutcome({ status: "approved", version: null, jobError: failed, error: null })).toBe(true);
  });

  it("is not flagged when a version was saved", () => {
    expect(
      noOutcome({
        status: "approved",
        version: { id: "v1", versionNo: 1, validationStatus: "pass" },
        jobError: failed,
        error: null,
      }),
    ).toBe(false);
  });

  it("is not flagged on old rows that simply have no run→version link", () => {
    // הרצות מלפני מיגרציה 0012 חסרות `generation_id`, ולכן אין להן גרסה
    // תואמת — תגית אדומה על כל ההיסטוריה היא רעש, לא ממצא.
    expect(noOutcome({ status: "approved", version: null, jobError: null, error: null })).toBe(false);
  });

  it("is not flagged when the row already says it failed", () => {
    expect(noOutcome({ status: "error", version: null, jobError: failed, error: "boom" })).toBe(false);
  });
});

describe("the same failure written in both places", () => {
  it("is shown once", () => {
    expect(sameFailure("internal · boom", "boom")).toBe(true);
    expect(sameFailure("boom", "boom")).toBe(true);
  });

  it("does not swallow a different one", () => {
    expect(sameFailure("vectorize_failed · no panel", "boom")).toBe(false);
    expect(sameFailure(null, "boom")).toBe(false);
  });
});

describe("what gets written onto the run row", () => {
  it("keeps the code, which is what separates our fault from a pipeline rejection", () => {
    const api = Object.assign(new Error("Version does not belong to design"), { code: "invalid_version" });
    expect(describeFailure(api)).toBe("invalid_version · Version does not belong to design");
  });

  it("falls back to the message when there is no code", () => {
    expect(describeFailure(new Error("boom"))).toBe("boom");
  });

  it("survives something that is not an error at all", () => {
    expect(describeFailure("boom")).toBe("boom");
  });
});
