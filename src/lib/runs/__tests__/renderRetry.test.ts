import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ניסיון רנדר שני — אחד בלבד, ורק על הכשל שהוא באמת מקרי (החלטת גל, 3.8.26).
//
// הדחייה שמצדיקה אותו: הרנדר חזר, אף מועמד לא עבר את המעקב או את הוולידציה
// (`vectorize_failed`). אותו פרומפט בדיוק יכול להצליח בסיבוב הבא, כי מה שהשתנה
// הוא מה שהמודל צייר. לעומת זאת דחיית מסנן תוכן ומידה בלתי אפשרית הן
// דטרמיניסטיות — שם ניסיון שני משלם פעמיים על אותה תשובה.
//
// הטסט קורא את המקור: מה שנשמר כאן הוא **היכן** הלולאה יושבת ומה גבולותיה,
// והרצה אמיתית שלו דורשת קופסת רנדר. הסכנות שהוא שומר מפניהן הן שלוש עריכות
// תמימות: להעלות את מספר הניסיונות, להריץ שוב גם על כשל דטרמיניסטי, ולתת
// לשתי ההרצות לכתוב לאותם קבצים ולאותה שורת יומן.

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/generate/route.ts"), "utf8");

describe("ניסיון הרנדר השני", () => {
  it("רץ רק כשאין אף מועמד", () => {
    expect(ROUTE).toContain("if (candidates.length === 0 && Date.now() - startedAt < RETRY_DEADLINE_MS)");
  });

  it("אחד בלבד — אין לולאה", () => {
    // לולאה כאן היא הדרך הקצרה לשרוף תקציב על פרומפט שאף פעם לא יעבוד.
    const block = ROUTE.slice(ROUTE.indexOf("attemptOnce(runId, 1)"));
    expect(block).toContain("attemptOnce(retryId, 2)");
    expect(block).not.toMatch(/for \(|while \(/);
  });

  it("מפסיק לנסות כשלא נשאר זמן להשלים", () => {
    // `maxDuration` הוא 300 שניות. ניסיון שמתחיל מאוחר מדי נהרג באמצע, והלקוחה
    // מקבלת ניתוק במקום את השגיאה המסבירה שכבר הייתה בידנו.
    expect(ROUTE).toContain("const RETRY_DEADLINE_MS = 150_000;");
    const deadline = Number(/RETRY_DEADLINE_MS = ([\d_]+)/.exec(ROUTE)![1].replace(/_/g, ""));
    const maxMs = Number(/maxDuration = (\d+)/.exec(ROUTE)![1]) * 1000;
    // חצי מהתקציב לניסיון הראשון, חצי לשני — הרצה טיפוסית לוקחת 25–50 שניות,
    // ולכן שניהם נכנסים בנוחות.
    expect(deadline).toBeLessThanOrEqual(maxMs / 2);
  });

  it("לכל ניסיון מזהה משלו — שתי שורות ביומן, בלי דריסה", () => {
    // נגזר ולא מוגרל: בקשה שמתחדשת אחרי ניתוק חייבת לחזור בדיוק לשני ה-jobs
    // שכבר שולמו על הקופסה ולא לפתוח שלישי (docs/C2_RESILIENT_GENERATION.md).
    // שונה בין הניסיונות — זו התכונה שהסעיף הזה שומר עליה.
    expect(ROUTE).toContain("const retryId = await deriveAttemptId(jobId, 2);");
    expect(ROUTE).toContain("runId = await deriveAttemptId(jobId, 1);");
    // נתיבי ה-storage נגזרים מהמזהה של הניסיון, אחרת השני מוחק את הראיות של
    // הראשון והשורה הראשונה מצביעה על הדמיה שאינה שלה.
    expect(ROUTE).toContain("runs/${attemptId}/reference.png");
    expect(ROUTE).toContain("id: attemptId,");
    expect(ROUTE).toContain("attempt: attemptNo,");
  });

  it("הגרסה נקשרת להרצה שבאמת יצרה אותה", () => {
    // `generationId` הוא מפתח הקיבוץ של ההצעות. אם הוא נשאר `runId` אחרי
    // שהניסיון השני הצליח, ההצעות תלויות בהרצה שנדחתה.
    expect(ROUTE).toContain("generationId = retryId;");
    expect(ROUTE).toContain("generationId,");
  });

  it("כשל דטרמיניסטי לא מגיע ללולאה בכלל", () => {
    // `content_blocked` ו-`bad_size` נזרקים מחוץ ל-attemptOnce (הראשון מתוך
    // runRenderJob, השני עוד לפני שנוצר job) ולכן אינם נכנסים לניסיון שני.
    const attempt = ROUTE.slice(
      ROUTE.indexOf("const attemptOnce ="),
      ROUTE.indexOf("return { job, renderPngPath, framed };"),
    );
    expect(attempt).not.toContain("content_blocked");
    expect(attempt).not.toContain("bad_size");
  });
});
