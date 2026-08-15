import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { he } from "@/i18n/he";
import { SITE, businessIdentified, businessLines, whatsappUrl } from "@/lib/site.config";

// בעסקת מכר מרחוק חוק הגנת הצרכן דורש לגלות מי העוסק ומה מדיניות הביטול,
// **לפני** העסקה. באתר החי לא היה אף אחד משניהם — רק כתובת מייל, ומשפט אחד
// על אי-החזרה שקבור במסך הסיכום (docs/FULL_AUDIT_2026-08.md, פרק 4, ממצא R1).
//
// הבדיקות כאן שומרות על שני דברים נפרדים: שהנוסח קיים ולא נעלם בעריכה, ושמה
// שמוצג בפועל אינו מתיימר להיות זהות מלאה כשהפרטים עוד לא הוזנו.

const TERMS_PAGE = readFileSync(join(process.cwd(), "src/app/(site)/terms/page.tsx"), "utf8");

describe("מדיניות ביטול", () => {
  it("קיימת בתנאים ולא רק במסך הסיכום", () => {
    expect(he.site.terms.cancelTitle).toBeTruthy();
    expect(he.site.terms.cancelBody.length).toBeGreaterThan(200);
  });

  it("מצהירה על חלון ביטול לפני תחילת הייצור, ולא רק על הפטור", () => {
    // הפטור לטובין שיוצרו במיוחד אמיתי — אבל הוא לא חל לפני שהייצור התחיל,
    // וכאן הייצור מתחיל רק אחרי אישור השרטוט. נוסח שמזכיר רק את הפטור הוא
    // נוסח ששולל מהלקוחה זכות שיש לה.
    expect(he.site.terms.cancelBody).toContain("עד שהייצור מתחיל");
    expect(he.site.terms.cancelBody).toContain("החזר מלא");
  });

  it("אינה מסתירה את האחריות לפגם מאחורי הפטור", () => {
    expect(he.site.terms.cancelBody).toContain("פגם");
  });

  it("מופיעה בעמוד עצמו, לפני שאר הסעיפים", () => {
    const business = TERMS_PAGE.indexOf("t.businessTitle");
    const cancel = TERMS_PAGE.indexOf("t.cancelTitle");
    const rest = TERMS_PAGE.indexOf("...t.sections");
    expect(business).toBeGreaterThan(-1);
    expect(cancel).toBeGreaterThan(business);
    expect(rest).toBeGreaterThan(cancel);
  });
});

describe("זהות העוסק", () => {
  it("הפרטים הוזנו — החובה לפי סעיף 14ג(א) מקוימת", () => {
    // שם ומספר זהות **וכתובת** — שלושתם נדרשים, ולא רק השניים שמרכיבים את
    // `businessIdentified`. שדה שיימחק בעריכה עתידית ייפול כאן.
    expect(businessIdentified()).toBe(true);
    expect(SITE.business.legalName).toBeTruthy();
    expect(SITE.business.idNumber).toMatch(/^\d{8,9}$/);
    expect(SITE.business.address).toBeTruthy();
  });

  it("שורת הזהות נושאת שם, מספר, כתובת, טלפון ומייל", () => {
    const line = businessLines().join(" · ");
    expect(line).toContain(SITE.business.legalName!);
    expect(line).toContain(SITE.business.idNumber!);
    expect(line).toContain(SITE.business.address!);
    expect(line).toContain(SITE.business.phone!);
    expect(line).toContain(SITE.contactEmail);
  });

  it("המנגנון של 'בהשלמה' נשאר — הוא מה שיחזיק אם פרט יוסר", () => {
    // ההיפך היה גרוע יותר: סעיף "פרטי העסק" עם מייל בודד נקרא כאילו זו
    // הזהות המלאה, וזו בדיוק ההטעיה שהסעיף נועד למנוע.
    expect(he.site.terms.businessPending).toContain("בהשלמה");
    expect(TERMS_PAGE).toContain("businessIdentified() ? businessLines()");
  });
});

describe("וואטסאפ", () => {
  it("המספר בפורמט בינלאומי, ספרות בלבד — אחרת wa.me לא פותח", () => {
    expect(SITE.business.whatsapp).toMatch(/^972\d{8,9}$/);
  });

  it("אותו מספר כמו הטלפון המוצג", () => {
    // שני מספרים שאומרים את אותו דבר נפרדים ביום שאחד מהם משתנה.
    const digits = SITE.business.phone!.replace(/\D/g, "").replace(/^0/, "972");
    expect(SITE.business.whatsapp).toBe(digits);
  });

  it("ההודעה המוכנה מקודדת ל-URL", () => {
    const url = whatsappUrl(he.site.whatsappPrefill)!;
    expect(url).toContain(`https://wa.me/${SITE.business.whatsapp}?text=`);
    expect(url).not.toContain(" ");
  });
});
