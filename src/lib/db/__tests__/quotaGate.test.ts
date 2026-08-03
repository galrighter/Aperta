import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// שני סדרי-פעולות בנתיב היצירה שאי אפשר לבדוק בהרצה בלי מסד ובלי קופסת רנדר,
// ושהפרתם שקטה: היא לא מפילה שום טסט, היא רק פותחת את התקציב.

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/generate/route.ts"), "utf8");

describe("שער המכסה", () => {
  it("משריין אחרי גזירת המזהה, ולפני שהצינור מתחיל", () => {
    // אחרי הגזירה — אחרת בקשה שמתחדשת אחרי ניתוק תשריין יחידה שנייה על אותה
    // הרצה. לפני הצינור — אחרת שוריין מקום לעבודה שכבר שולם עליה.
    const derive = ROUTE.indexOf("runId = await deriveAttemptId(jobId, 1);");
    const reserve = ROUTE.indexOf("await reserveGeneration({");
    const start = ROUTE.indexOf("pipelineStarted = true;");
    expect(derive).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(derive);
    expect(start).toBeGreaterThan(reserve);
  });

  it("דחייה על המכסה אינה נרשמת כהרצה שנכשלה", () => {
    // אחרת פרופיל שהגיע לתקרת ההצלחות מייצר שורת כישלון בכל ניסיון נוסף,
    // וסוגר על עצמו גם את מכסת הכישלונות — מעגל שנפתח רק למחרת.
    expect(ROUTE).toContain('err instanceof ApiError && err.code === "rate_limited"');
    expect(ROUTE).toContain("if (!pipelineStarted && !quotaRejection) {");
  });
});
