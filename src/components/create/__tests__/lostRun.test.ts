import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// "היצירה נכשלה" על עיצוב שמוכן ומחכה.
//
// מה שנמדד במסע אמיתי (טבעת, אנדרואיד): הלקוח לחץ Back באמצע ההמתנה כמה
// פעמים, המסך נתקע והכריז שהעיצוב נכשל. גם החזרה מ"העיצובים שלי" אמרה
// "טעינת העיצוב נכשלה", וגם הקישור מהמייל — בזמן שהמייל עצמו הודיע שהעיצוב
// מוכן. רק דפדפן שנסגר ונפתח מחדש הצליח לפתוח אותו.
//
// שני כשלים נפרדים, ושניהם אומרים "נכשל" על משהו שהצליח:
//
// 1. **ההרצה.** מה שנקטע הוא החוט אל הדפדפן ולא הצינור בשרת. `pollJob` מכסה
//    בקשה שנקטעה, אבל לא לשונית שנזרקה מהזיכרון או המתנה שפגה — ואז המסך
//    הכריז על כשל בזמן שהגרסה כבר נשמרה.
// 2. **הפתיחה מחדש.** `resume` חיכה לחישוב הגאומטריה (`/api/validate`) לפני
//    שהציג את העיצוב, וכשל של החישוב הזה — מגבלת קצב, זמן CPU בקצה, רשת
//    חולפת — הפיל את הפתיחה כולה. הגאומטריה משמשת את התלת-ממד בלבד.
//
// הטסטים קוראים את המקור: אין DOM כאן, ומה שנשמר הוא ההכרעה עצמה — לשאול את
// השרת לפני שמכריזים על כשל, ולא לתלות פתיחה של עיצוב קיים בחישוב תצוגה.

const PAGE = readFileSync(join(process.cwd(), "src/app/(site)/design/page.tsx"), "utf8");

/** גוף הפונקציה, מהשורה שפותחת אותה ועד ה-`useCallback` הבא. */
function body(name: string): string {
  const head = `const ${name} = useCallback(`;
  const start = PAGE.indexOf(head);
  expect(start, `${name} לא נמצאה`).toBeGreaterThan(-1);
  const next = PAGE.indexOf("useCallback(", start + head.length);
  return PAGE.slice(start, next > -1 ? next : PAGE.length);
}

describe("הרצה שאיבדה את החוט", () => {
  const GENERATE = body("startGeneration");

  it("הכשל נבדק מול השרת לפני שהוא מוצג", () => {
    // בלי זה הלקוחה מקבלת "היצירה נכשלה" ומייל "העיצוב שלך מוכן" על אותו
    // עיצוב, באותה דקה.
    expect(GENERATE).toContain("let ranOn: string | null = null;");
    expect(GENERATE).toContain("ranOn = design.id;");
    expect(GENERATE).toContain("const { design, versions } = await api.getDesign(ranOn);");
  });

  it("גרסה שנמצאה מוצגת כתוצאה ולא כשגיאה", () => {
    const at = GENERATE.indexOf("await api.getDesign(ranOn)");
    // עד תחילת מסך השגיאה — כל מה שביניהם הוא מסלול ההצלחה שהתגלתה באיחור.
    const found = GENERATE.slice(at, GENERATE.indexOf("procError: apiErr?.message", at));
    expect(found).toContain("const last = versions[versions.length - 1];");
    expect(found).toContain("pushEntry(");
    expect(found).toContain('goReplacing("result")');
    // ההרצה נסגרה — הרשומה שמחזיקה את החלון הקופץ מיותרת מכאן והלאה.
    expect(found).toContain("clearPendingJob();");
  });

  it("כשאין גרסה, מסך השגיאה נשאר התשובה", () => {
    // הבדיקה מוסיפה מסלול, לא מחליפה: content_blocked, מידה שנדחתה ומכסה
    // יומית הם כשלים אמיתיים שאין להם גרסה, והמסך שלהם הוא מה שצריך לראות.
    expect(GENERATE).toContain("procFailCount: prev.procFailCount + 1,");
    expect(GENERATE).toContain("procError: apiErr?.message ?? he.errGeneric,");
  });
});

describe("פתיחה מחדש של עיצוב קיים", () => {
  const RESUME = body("resume");

  it("כשל בחישוב הגאומטריה אינו מפיל את הפתיחה", () => {
    // `/api/validate` מריץ boolean ops כבדים ומוגבל בקצב. עד כאן כל כשל שלו
    // הוצג כ"טעינת העיצוב נכשלה" על עיצוב שקיים, מוכן ומצויר.
    expect(RESUME).toContain(".catch(() => null);");
    expect(RESUME).toContain("val?.geometry ?? null");
  });

  it("מסך התוצאה משלים את הגאומטריה לפי דרישה", () => {
    // מה שמצדיק את הוויתור למעלה: בלי הגאומטריה נשארת הפריסה השטוחה,
    // והאפקט הזה מביא אותה כשעוברים לתלת-ממד.
    expect(PAGE).toContain('if (s.screen !== "result" || s.resultMode !== "render") return;');
    expect(PAGE).toContain("if (!entry?.svg || entry.geometry ||");
  });

  it("עיצוב שנפתח ויש לו גרסה מפסיק להיות `טרם הושלם`", () => {
    // הרשומה המקומית נכתבת כ-pending כבר עם יצירת העיצוב, ומי שמעדכן אותה
    // הוא המסך שקיבל את הגרסה. מי שאיבדה את החוט לא עברה שם.
    expect(RESUME).toContain("markMyDesignDone(design.id);");
    expect(RESUME).toContain("setSaved(listMyDesigns());");
  });

  it("היעדר גרסה עדיין מחזיר לטופס עם מה שהוזן", () => {
    // המסלול השני של אותה פונקציה, ואסור שהוא ייבלע: עיצוב שהיצירה שלו
    // באמת נקטעה חוזר לבריף עם ההסבר, ולא למסך תוצאה ריק.
    expect(RESUME).toContain("resumeIncomplete: true,");
    expect(RESUME).toContain('pushScreen("brief")');
  });
});
