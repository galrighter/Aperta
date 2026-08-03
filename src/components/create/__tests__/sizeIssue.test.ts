import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CIRC_LIMIT_MM, INITIAL, US_SIZE_LIMIT, WIDTH, sizeIssue, stripLengthMm, type CreateState,
} from "../model";
import { FAB } from "@/lib/fabrication.config";
import { US_RING_SIZES } from "@/lib/sizing";

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
    // כולל הקצוות שנוספו ב-3.8.26: מידות ילדים (1–3.5) ואצבע גדולה (13.5–16).
    for (const size of ["1", "2", "3.5", "4", "6.5", "13", "14", "16"]) {
      expect(sizeIssue(ring(size)), `מידה ${size}`).toBeNull();
    }
  });

  it("בטבעת: מידה מחוץ לטבלה נעצרת במקום להיצבט בשקט", () => {
    // `idMmFromUsSize` צובט לקצה הטבלה: מידה 20 הפכה שם ל-16 ומידה 0.5 ל-1,
    // כלומר מדידה של הלקוחה שתוקנה למספר אחר בלי חיווי.
    expect(sizeIssue(ring("20"))).toEqual({ kind: "usSize", value: 20, lo: 1, hi: 16 });
    expect(sizeIssue(ring("0.5"))?.kind).toBe("usSize");
  });

  it("הטווח נגזר מהטבלה ולא נכתב פעמיים", () => {
    // שני מספרים שאומרים את אותו דבר נפרדים ביום שבו אחד מהם משתנה — וזה בדיוק
    // מה שקרה עכשיו כשהטבלה התרחבה.
    expect(US_SIZE_LIMIT).toEqual([US_RING_SIZES[0], US_RING_SIZES[US_RING_SIZES.length - 1]]);
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

  it("טבעת: **כל** מידה בטבלה עוברת את שער השרת, בכל רוחב", () => {
    // הטבלה התרחבה ל-1–16, והשאלה שהתשובה לה חייבת להיות אוטומטית היא אם
    // הקצוות החדשים עדיין מייצרים פריסה שהשרת מוכן לקבל. רוחב הפס משנה את
    // האורך (תוספת הנוחות), ולכן שני הקצוות שלו נבדקים גם הם.
    const [floor, ceil] = FAB.products.ring.lengthLimitMm;
    for (const size of US_RING_SIZES) {
      for (const ringWidth of [WIDTH.ring.min, WIDTH.ring.def, WIDTH.ring.max]) {
        const length = stripLengthMm({ ...ring(String(size)), ringWidth });
        expect(length, `מידה ${size} ברוחב ${ringWidth}`).toBeGreaterThanOrEqual(floor);
        expect(length, `מידה ${size} ברוחב ${ringWidth}`).toBeLessThanOrEqual(ceil);
      }
    }
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
