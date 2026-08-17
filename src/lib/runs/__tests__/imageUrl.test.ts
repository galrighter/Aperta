import { describe, expect, it } from "vitest";
import { RUN_IMAGE_NAMES, isRunImageName, runImageUrl } from "../imageUrl";

// מה שהבדיקות כאן שומרות עליו הוא **הצורה** של הכתובת, לא הניסוח שלה.
//
// עד 16.8 היו שני מימושים: היומן החזיר קישור למסלול מגודר, ו-`/api/generate`
// חתם בעצמו והחזיר כתובת חתומה ל-Supabase — שנוסעת ללקוח, נשמרת בשורת ה-job,
// פגה אחרי שעה, ותלויה ב-`img-src` של דומיין אחר. שלוש התכונות שנבדקות כאן
// (יחסית, בלי מארח, בלי סוד) הן בדיוק שלוש הבעיות ההן.

describe("runImageUrl", () => {
  it("כתובת יחסית לאתר שלנו — לא דומיין חיצוני", () => {
    const url = runImageUrl("run-1", "render");
    expect(url).toBe("/api/debug/log/run-1/image/render");
    expect(url.startsWith("/")).toBe(true);
    // ‏`new URL` על כתובת יחסית זורק בלי בסיס. זה הביטוי המדויק של "אין כאן
    // מארח": כתובת עם `https://` הייתה נבנית ועוברת.
    expect(() => new URL(url)).toThrow();
  });

  it("אינה נושאת סוד — אין חתימה, אין תפוגה", () => {
    const url = runImageUrl("run-1", "render");
    expect(url).not.toContain("token");
    expect(url).not.toContain("?");
    expect(url).not.toContain("supabase");
  });

  it("יציבה — אותה הרצה, אותה כתובת בכל קריאה", () => {
    expect(runImageUrl("run-1", "render")).toBe(runImageUrl("run-1", "render"));
  });

  it("כל שם תמונה מקבל כתובת משלו", () => {
    const urls = RUN_IMAGE_NAMES.map((n) => runImageUrl("run-1", n));
    expect(new Set(urls).size).toBe(RUN_IMAGE_NAMES.length);
  });
});

describe("isRunImageName", () => {
  it("מכיר את השמות שהרצה שומרת", () => {
    for (const name of RUN_IMAGE_NAMES) expect(isRunImageName(name)).toBe(true);
  });

  it("דוחה כל שם אחר — כולל ניסיון לצאת מהתיקייה", () => {
    // המסלול מתרגם שם לנתיב ב-bucket. שם שאינו ברשימה הוא 400, ולא חתימה.
    for (const bad of ["", "svg", "../secrets", "render/../../etc", "RENDER"]) {
      expect(isRunImageName(bad)).toBe(false);
    }
  });
});
