import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CIRC_LIMIT_MM, INITIAL, sizeIssue, stripLengthMm, type CreateState } from "../model";
import { FAB } from "@/lib/fabrication.config";

// RM-0077 (3.8.26): הוזמן צמיד ב"היקף מדויק" 10 — עשרה מילימטרים, כלומר
// סנטימטרים בשדה שמבקש מ"מ. החישוב נתן פריסה של 15.8 מ"מ על רוחב 18, הפרומפט
// ביקש ממודל התמונה פריט "0.9 times longer than it is wide", המודל צייר ריבוע,
// והווקטורייזר עקב אחריו ב-IoU 0.93. ההרצה נרשמה `approved` — ובצדק, לפי כל
// מדד בצינור היא הצליחה. הכשל היחיד היה שאיש לא הסתכל על הקלט.

const bracelet = (circ: string): CreateState => ({ ...INITIAL, product: "bracelet", circ });
const ring = (ringSize: string): CreateState => ({ ...INITIAL, product: "ring", ringSize });

describe("sizeIssue", () => {
  it("תופס את המידה של RM-0077", () => {
    const issue = sizeIssue(bracelet("10"));
    expect(issue).toEqual({
      kind: "circumference",
      value: 10,
      lo: CIRC_LIMIT_MM.bracelet[0],
      hi: CIRC_LIMIT_MM.bracelet[1],
    });
  });

  it("שותק על מידות אמיתיות", () => {
    for (const circ of ["90", "110", "165", "168", "230", "260"]) {
      expect(sizeIssue(bracelet(circ))).toBeNull();
    }
  });

  it("מידות ילדים עוברות — הן מוצר ולא טעות", () => {
    // תינוק ~9 ס"מ, פעוט ~11, ילד בן שש ~13. כולן חייבות לעבור; מה שנחסם הוא
    // מספר שאינו מדידה בכלל.
    for (const circ of ["90", "95", "110", "130"]) {
      expect(sizeIssue(bracelet(circ)), `היקף ${circ}`).toBeNull();
    }
    for (const typo of ["9", "11", "13", "16"]) {
      expect(sizeIssue(bracelet(typo)), `טעות ${typo}`).not.toBeNull();
    }
  });

  it("שותק כשלא הוזנה מידה מדויקת — כפתור סטנדרטי אינו יכול לחרוג", () => {
    expect(sizeIssue({ ...INITIAL, product: "bracelet", circ: "" })).toBeNull();
    expect(sizeIssue({ ...INITIAL, product: "ring", ringSize: "" })).toBeNull();
  });

  it("תופס גם היקף גדול מדי", () => {
    expect(sizeIssue(bracelet("1650"))?.value).toBe(1650);
  });

  it("בטבעת: מידה אמריקאית שבטבלה עוברת", () => {
    for (const size of ["4", "6.5", "13"]) expect(sizeIssue(ring(size))).toBeNull();
  });

  it("בטבעת: מידה אמריקאית מחוץ לטבלה נעצרת במקום להיצבט בשקט", () => {
    // `idMmFromUsSize` צובט לקצה הטבלה: מידה 20 הפכה שם ל-13 ומידה 2 ל-4,
    // כלומר מדידה של הלקוחה שתוקנה למספר אחר בלי חיווי.
    expect(sizeIssue(ring("20"))).toEqual({ kind: "usSize", value: 20, lo: 4, hi: 13 });
    expect(sizeIssue(ring("2"))?.kind).toBe("usSize");
  });

  it("בטבעת: היקף במ\"מ כן נמדד", () => {
    expect(sizeIssue(ring("55"))).toBeNull();
    expect(sizeIssue(ring("300"))?.value).toBe(300);
  });
});

describe("הגבולות מסכימים עם שער השרת", () => {
  // שני השערים מודדים דברים שונים — כאן היקף, בשרת אורך פריסה — ולכן הם יכולים
  // להיפרד בשקט: מידה שהמסך מרשה תיפול בשרת, והלקוחה תגלה זאת רק אחרי שהעיצוב
  // כבר נוצר. הבדיקה סוגרת את הפער בשני הקצוות ובכל צירוף של ישיבה ורוחב.
  it.each(["tight", "regular", "loose"] as const)("ישיבה %s", (fit) => {
    const [lo, hi] = CIRC_LIMIT_MM.bracelet;
    const [floor, ceil] = FAB.products.bracelet.lengthLimitMm;
    for (const widthMm of [5, 18, 80]) {
      const small = stripLengthMm({ ...bracelet(String(lo)), fit, braceletWidth: widthMm });
      const large = stripLengthMm({ ...bracelet(String(hi)), fit, braceletWidth: widthMm });
      expect(small).toBeGreaterThanOrEqual(floor);
      expect(large).toBeLessThanOrEqual(ceil);
    }
  });

  it("טבעת: קצוות טווח ההיקף נכנסים לגבולות השרת", () => {
    const [floor, ceil] = FAB.products.ring.lengthLimitMm;
    const [lo, hi] = CIRC_LIMIT_MM.ring;
    expect(stripLengthMm(ring(String(lo)))).toBeGreaterThanOrEqual(floor);
    expect(stripLengthMm(ring(String(hi)))).toBeLessThanOrEqual(ceil);
  });

  it("המידה של RM-0077 נדחית גם בשרת, לא רק במסך", () => {
    expect(stripLengthMm(bracelet("10"))).toBeLessThan(FAB.products.bracelet.lengthLimitMm[0]);
  });
});

describe("מסך המידות", () => {
  const SCREEN = readFileSync(
    join(process.cwd(), "src/components/create/SizesScreen.tsx"),
    "utf8",
  );

  it("חוסם את ההמשך כשהמידה אינה אפשרית", () => {
    // הודעה בלי חסימה היא בדיוק המצב הקודם: אפשר להמשיך, וההדמיה תצא ריבוע.
    expect(SCREEN).toContain("disabled={busy || Boolean(issue)}");
  });

  it("מציג את השגיאה", () => {
    expect(SCREEN).toContain("d.sizeOutOfRange(issue.value, issue.lo, issue.hi)");
  });
});
