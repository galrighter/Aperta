import { describe, expect, it } from "vitest";
import { verdictOf } from "../runs";

/**
 * מה שנרשם ביומן על מועמד שנפסל.
 *
 * הקוד לבדו (`["V2"]`) סופר ולא מסביר — וזו הייתה בדיוק התשובה שקיבלנו על
 * AP-0170: המודל צייר שלושה עיצובים, הלקוחה ראתה שניים, והשורה לא אמרה למה.
 */

const report = (
  checks: Array<{ check: string; status: string; details?: string }>,
  status = "fail",
) => ({ status, checks });

describe("verdictOf", () => {
  it("נושא את הקודים שנפלו ואת מה שהם אמרו", () => {
    const out = verdictOf(
      report([
        { check: "V1", status: "pass", details: "SVG contract OK" },
        { check: "V2", status: "fail", details: "Material splits into 2 disconnected components. Island centers (mm): (81.3, 9.0)." },
      ]),
      1,
    );
    expect(out.status).toBe("fail");
    expect(out.failed).toEqual(["V2"]);
    expect(out.failedDetails?.[0]).toContain("Island centers");
  });

  it("מועמד שעבר אינו נושא שדה פירוט ריק", () => {
    const out = verdictOf(report([{ check: "V2", status: "pass", details: "single body" }], "pass"), 1.0004);
    expect(out.failed).toEqual([]);
    expect(out.failedDetails).toBeUndefined();
    // המתיחה מעוגלת לשלוש ספרות, כמו שהייתה.
    expect(out.stretch).toBe(1);
  });

  it("פירוט ארוך נחתך — שורת יומן היא דיווח, לא עותק", () => {
    const out = verdictOf(report([{ check: "V3", status: "fail", details: "x".repeat(2000) }]), 1);
    expect(out.failedDetails?.[0]).toHaveLength(400);
  });
});
