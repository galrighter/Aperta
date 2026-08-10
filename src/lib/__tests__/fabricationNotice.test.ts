import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blockCause, fabricationRef, hasFindings, markedChecks, needsLook,
} from "../fabricationNotice";
import type { CheckResult, ValidationReport } from "@/lib/geometry/types";

// הדוח שהלקוחה קיבלה בפועל (צילום מסך, 10.8): שלושה כשלים ואזהרת כיתוב,
// ארבע שורות אדומות, ומתחתיהן הצעה לבחור חלופה שלא הייתה קיימת.
const FIELD: CheckResult[] = [
  { check: "V2", status: "fail", message: "", details: "", locations: [{ x: 10, y: 5 }] },
  { check: "V3", status: "fail", message: "", details: "", locations: [{ x: 20, y: 5 }] },
  { check: "V4", status: "fail", message: "", details: "", locations: [1, 2, 3, 4].map((x) => ({ x, y: 5 })) },
  { check: "LETTERING_BRIDGE", status: "warn", message: "", details: "", locations: [] },
];

const check = (
  c: string, status: CheckResult["status"], n = 0,
): CheckResult => ({
  check: c, status, message: "", details: "",
  locations: Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })),
});

describe("סיבת החסימה", () => {
  it("אין כשל — אין סיבה", () => {
    expect(blockCause([check("V4", "warn"), check("V1", "pass")])).toBeNull();
    expect(blockCause([])).toBeNull();
    expect(blockCause(null)).toBeNull();
  });

  it("המשפחה הדומיננטית לפי מספר המקומות", () => {
    // V2+V3 הם שני ממצאים אבל שני מקומות; V4 לבדו הוא ארבעה, והוא גם הסיבה
    // שהעיצוב יצא כך. משפט אחד ללקוחה, ולא שלושה.
    expect(blockCause(FIELD)).toBe("thin");
  });

  it("שתי בדיקות באותה משפחה נספרות יחד", () => {
    // V2 ו-V3 מתארים את אותו פגם משני צדדים (ראו dropDetachedMaterial).
    expect(blockCause([check("V2", "fail", 2), check("V3", "fail", 2), check("V4", "fail", 3)]))
      .toBe("detached");
  });

  it("כשל בלי מיקומים עדיין נספר", () => {
    // V1 אינו מדווח מקומות. אילו שקל אפס, `blockCause` היה בוחר משפחה
    // שרירותית דווקא כשהוא הכשל היחיד.
    expect(blockCause([check("V1", "fail", 0)])).toBe("other");
  });

  it("אזהרות אינן חוסמות ואינן קובעות סיבה", () => {
    expect(blockCause([check("V4", "warn", 9), check("V5", "fail", 1)])).toBe("small");
  });

  it("בדיקה לא מוכרת נופלת ל-other ולא מפילה", () => {
    expect(blockCause([check("VX", "fail", 1)])).toBe("other");
  });
});

describe("מה מוצג ומה מסומן", () => {
  it("מסמנים על הפריסה רק את מה שסיפרנו עליו", () => {
    // ארבעה מקומות של V4 ועוד שניים של V2/V3 — ואף עיגול על אזהרה.
    expect(markedChecks(FIELD).map((c) => c.check)).toEqual(["V2", "V3", "V4"]);
    expect(markedChecks([check("V4", "warn", 3)])).toEqual([]);
  });

  it("בקשת המבט על הכיתוב היא היחידה שעולה מאזהרה", () => {
    expect(needsLook(FIELD)).toBe(true);
    expect(needsLook([check("V4", "warn", 1), check("V8", "warn", 1)])).toBe(false);
  });
});

describe("השורה הטכנית", () => {
  const report = (checks: CheckResult[]): ValidationReport => ({
    status: checks.some((c) => c.status === "fail") ? "fail" : "warn",
    checks,
    metrics: { stripAreaMm2: 0, cutAreaMm2: 0, openAreaPct: 0, estWeightGrams: 0 },
  });

  it("מדפיסה מה נפל ובכמה מקומות, מופרד לפי חומרה", () => {
    // זה מה שמחליף את רשימת הממצאים בתור אמצעי האבחון שלנו — צילום מסך אחד
    // צריך להספיק. V4 עם ארבעה מקומות חייב להיראות שונה מ-V4 עם אחד.
    expect(fabricationRef(report(FIELD))).toBe("fail V2 V3 V4×4 · warn LETTERING_BRIDGE");
  });

  it("שקטה כשאין ממצאים", () => {
    expect(fabricationRef(report([check("V1", "pass")]))).toBe("");
    expect(fabricationRef(null)).toBe("");
    expect(hasFindings(report([check("V1", "pass")]))).toBe(false);
    expect(hasFindings(report(FIELD))).toBe(true);
  });

  it("סובלת דוח חלקי מה-DB", () => {
    // `validation_report` הוא jsonb ונקרא גם משורות שנכתבו לפני שהמבנה
    // התייצב — אותה סיבה שבגללה `report` נקרא בהגנה ב-ResultScreen.
    expect(fabricationRef({ checks: [{ check: "V2", status: "fail" }] } as unknown as ValidationReport))
      .toBe("fail V2");
    expect(hasFindings(undefined)).toBe(false);
  });
});

describe("מה ירד מהמסך של הלקוחה", () => {
  const RESULT = readFileSync(
    join(process.cwd(), "src/components/create/ResultScreen.tsx"), "utf8",
  );

  it("אין רשימת ממצאים מהמנוע", () => {
    // `c.message` הוא הנוסח שנכתב לסדנה ("צוואר שיישבר בחיתוך"). הוא ממשיך
    // להישמר בדוח ולהיקרא ביומן ההרצות — ולא מוצג במסע היצירה.
    expect(RESULT).not.toContain("c.message");
  });

  it("מסמן על הפריסה דרך markedChecks בלבד", () => {
    expect(RESULT).toContain("markedChecks(checks)");
    expect(RESULT).not.toContain('checks\n    .filter((c) => c.status !== "pass")');
  });
});
