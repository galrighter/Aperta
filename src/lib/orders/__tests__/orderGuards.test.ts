import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ארבעה שערים בשרת שאי אפשר להריץ בלי מסד, ושהפרתם שקטה: אף טסט לא נופל
// כשהם נעלמים, פשוט חוזרים המצבים שהאבחון (docs/FULL_AUDIT_2026-08.md, פרק 3)
// מצא. הבדיקות כאן קוראות את הקוד עצמו, כמו `quotaGate.test.ts`.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ORDERS = read("src/app/api/orders/route.ts");
const DESIGN = read("src/app/api/designs/[id]/route.ts");
const DB_ORDERS = read("src/lib/db/orders.ts");
const PRODUCTION = read("src/lib/orders/production.ts");

describe("מחיקת עיצוב שהוזמן (ממצא 2)", () => {
  it("ה-DELETE נחסם כשיש הזמנה פעילה — לפני שנגעו במשהו", () => {
    const check = DESIGN.indexOf("hasActiveOrderForDesign");
    const firstDelete = DESIGN.indexOf('sb.from("exports").delete()');
    expect(check).toBeGreaterThan(-1);
    // הסדר הוא כל העניין: בדיקה אחרי מחיקת ה-exports היא בדיקה שמגיעה מאוחר.
    expect(firstDelete).toBeGreaterThan(check);
    expect(DESIGN).toContain("design_has_order");
  });

  it("הזמנה מבוטלת אינה חוסמת", () => {
    expect(DB_ORDERS).toContain('.neq("status", "cancelled")');
  });
});

describe("הזמנה על גרסה שנכשלה בוולידציה (ממצא 4)", () => {
  it("השרת דוחה, ולא רק הדפדפן", () => {
    expect(ORDERS).toContain('version.validation_status === "fail"');
    expect(ORDERS).toContain("version_not_producible");
  });
});

describe("כשל שליפת גרסה מול גרסה זרה (ממצא 5)", () => {
  it("‏catch גורף לא בולע כשל DB חולף", () => {
    // `.catch(() => null)` היה מאפס את הגרסה בשקט, והייצוא נפל ל-current.
    expect(ORDERS).not.toContain("getVersion(candidate).catch(() => null)");
    expect(ORDERS).toContain('err.code === "not_found"');
  });
});

describe("צילום המידות על ההזמנה (ממצא 3)", () => {
  it("נכתב ברגע ההזמנה מהעיצוב, ולא מגוף הבקשה", () => {
    expect(ORDERS).toContain("length_mm: Number(design.length_mm)");
    expect(ORDERS).toContain("thickness_mm: Number(design.thickness_mm)");
  });

  it("נתוני הייצור מעדיפים את הצילום על העיצוב החי", () => {
    expect(PRODUCTION).toContain("order.length_mm != null && order.thickness_mm != null");
    expect(PRODUCTION).toContain("dimsFromOrder ? Number(order.length_mm)");
  });

  it("‏PATCH על עיצוב מתוחם — עובי חופשי הפיל את עמוד ההזמנה ב-500", () => {
    expect(DESIGN).toContain("supportedThicknessesMm");
    expect(DESIGN).not.toMatch(/thicknessMm: z\.number\(\)\.positive\(\)/);
    expect(DESIGN).not.toMatch(/lengthMm: z\.number\(\)\.positive\(\)/);
  });
});

describe("מעבר סטטוס תחת שני טאבים (ממצא 8)", () => {
  it("העדכון מותנה בסטטוס שההיסטוריה נבנתה עליו", () => {
    expect(DB_ORDERS).toContain('.eq("status", before.status)');
    expect(DB_ORDERS).toContain("status_conflict");
  });
});

describe("סימון תשלום (ממצא 6)", () => {
  it("חותמת ולא boolean, וניתן לביטול", () => {
    expect(DB_ORDERS).toContain("paid_at: paid ? now : null");
  });
});
