import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// סדר פעולות בנתיב היצירה שהפרתו שקטה: היא לא מפילה שום טסט, היא רק מחזירה
// את המצב שבו הרצה שאיבדה את מי שפתח אותה נתקעת.

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/generate/route.ts"), "utf8");

describe("ההקשר שמאפשר לסיים בלי הבקשה", () => {
  it("נשמר בזמן שהרנדר רץ, ולא אחרי שהוא חזר", () => {
    // זו כל הנקודה. רנדר לוקח 30–90 שניות וה-isolate יכול למות באמצעם; הקשר
    // שנשמר אחרי החזרה מכסה רק את השניות האחרונות. השמירה תלויה ב-`onOpen`,
    // שנקרא ברגע שהקופסה קיבלה את ההרצה — כלומר לפני שהיא הסתיימה.
    const call = ROUTE.indexOf("await runRenderJob({");
    const hook = ROUTE.indexOf("onOpen:", call);
    const closes = ROUTE.indexOf("const renderPngPath", call);
    expect(call).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(call);
    expect(hook).toBeLessThan(closes);
    expect(ROUTE).toContain("setJobContext(jobId, runId, {");
  });

  it("נושא את המזהה שהקופסה מחזיקה תחתיו", () => {
    // בלעדיו אי אפשר לאסוף את ההרצה: המזהה נגזר גם מתוכן הבקשה, ותמונת
    // ההשראה שנשלחה בה אינה נשמרת אצלנו בגודלה כדי לשחזר אותה בייט-בייט.
    expect(ROUTE).toContain("boxJobId,");
  });

  it("נושא את הגשרים שנחתכו — הם לא ניתנים לגזירה מה-SVG", () => {
    // הגשרים נחתכים מהפונט לפני שהמודל צייר משהו. מי שיסיים בלעדיהם ימחק את
    // החלל של האות במקום לגשר אותו.
    expect(ROUTE).toContain("bridges: bridgePlan.letterBridges");
    expect(ROUTE).toContain("tightShare:");
  });
});
