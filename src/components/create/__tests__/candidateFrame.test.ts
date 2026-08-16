import { describe, it, expect } from "vitest";
import { candidateFrame } from "../model";

// רצועת ההצעות ציירה כל הצעה במסגרת של **הגרסה המוצגת**. במסלול Story זה שגוי
// מיסודו: `storyFrameDims` ממסגר כל מועמד לרוחב שקנה מידה אחיד מייצר עבורו,
// ולכן ארבע ההצעות של אותה הרצה חוזרות בארבעה viewBox שונים.
//
// המספרים כאן הם AP-0200 (16.8) כפי שהוא שמור ב-design_versions.candidates:
// אותו אורך ‎54.4 בכל הארבע, וארבעה רוחבים. הגרסה שנשמרה היא הראשונה, ולכן
// המסך צייר את כולן ב-‎7.94 — הצעה 3 (‎13.49) נחתכה בשני שלישים, והצעות 2 ו-4
// (‎5.33, ‎6.7) קיבלו רצועה כהה חשופה מתחתיהן.
const AP0200 = [7.94, 5.33, 13.49, 6.7];
const svgOf = (widthMm: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54.4 ${widthMm}"><g id="cutouts"></g></svg>`;

const ENTRY = { lengthMm: 54.4, widthMm: AP0200[0] };

describe("המסגרת של הצעה ברצועה", () => {
  it("כל הצעה נמדדת לפי ה-viewBox שלה ולא לפי הגרסה המוצגת", () => {
    for (const w of AP0200) {
      expect(candidateFrame(svgOf(w), ENTRY)).toEqual({ lengthMm: 54.4, widthMm: w });
    }
  });

  it("הצעה גבוהה מהגרסה אינה נחתכת ב-viewBox", () => {
    // חלופה 3: הקשת שהוצגה כשני שלישים מעצמה.
    const f = candidateFrame(svgOf(13.49), ENTRY);
    expect(f.widthMm).toBe(13.49);
    expect(f.widthMm).toBeGreaterThan(ENTRY.widthMm);
  });

  it("הצעה נמוכה מהגרסה אינה משאירה פס כהה מתחתיה", () => {
    // חלופה 2: הפס הכהה נמשך עד ‎7.94 בזמן שהעיצוב נגמר ב-‎5.33 — שתי הרצועות
    // שנראו בצילום המסך, עם חלל בהיר ביניהן.
    const f = candidateFrame(svgOf(5.33), ENTRY);
    expect(f.widthMm).toBe(5.33);
    expect(f.widthMm).toBeLessThan(ENTRY.widthMm);
  });

  it("הצעה בלי viewBox תקין נופלת למסגרת הגרסה — ההתנהגות שהייתה", () => {
    expect(candidateFrame("<svg><g id=\"cutouts\"></g></svg>", ENTRY)).toEqual(ENTRY);
    expect(candidateFrame(null, ENTRY)).toEqual(ENTRY);
    expect(candidateFrame(undefined, ENTRY)).toEqual(ENTRY);
  });
});
