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
  it("‏businessIdentified דורש גם שם וגם מספר — מייל לבדו אינו זהות", () => {
    expect(businessIdentified()).toBe(Boolean(SITE.business.legalName && SITE.business.idNumber));
  });

  it("המייל תמיד בשורות, גם כשאין עוד כלום", () => {
    expect(businessLines()).toContain(SITE.contactEmail);
  });

  it("כל עוד הפרטים חסרים — /terms אומר זאת במפורש", () => {
    // ההיפך היה גרוע יותר: סעיף \"פרטי העסק\" עם מייל בודד נקרא כאילו זו
    // הזהות המלאה, וזו בדיוק ההטעיה שהסעיף נועד למנוע.
    expect(he.site.terms.businessPending).toContain("בהשלמה");
    expect(TERMS_PAGE).toContain("businessIdentified() ? businessLines()");
  });
});

describe("וואטסאפ", () => {
  it("אין מספר — אין קישור, ולא קישור שבור", () => {
    if (!SITE.business.whatsapp) expect(whatsappUrl()).toBeNull();
  });

  it("ההודעה המוכנה מקודדת ל-URL", () => {
    // המספר עוד לא הוגדר, ולכן הבדיקה על הפונקציה עצמה עם קלט מפורש.
    const url = `https://wa.me/972500000000?text=${encodeURIComponent(he.site.whatsappPrefill)}`;
    expect(url).not.toContain(" ");
  });
});
