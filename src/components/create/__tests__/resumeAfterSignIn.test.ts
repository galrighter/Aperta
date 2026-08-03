import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// המשך אוטומטי אחרי כניסה לחשבון — מסלול החזרה מגוגל.
//
// מה שקרה: הכניסה עם גוגל טוענת את העמוד מחדש. אפקט אחד משחזר את המשפך מה-
// `stash` וקורא מיד ל-`afterSignedIn`, שממשיך את הפעולה שהמתינה. הפונקציה
// שהמשיכה נתפסה יחד עם ה-closure שלה — ובו `s` הוא עדיין `INITIAL`, כי
// ה-`setState` שמשחזרת את המצב טרם עברה רינדור. `canGenerate` על טופס ריק
// מחזירה false, והיצירה חזרה למסך הבריף. הלקוח ראה את התיאור שלו שלם על המסך
// ונדרש ללחוץ "שליחה" שוב, בלי שום סימן למה הלחיצה הראשונה לא הספיקה.
//
// הטסט קורא את המקור ולא מריץ את העמוד: מה שנשמר כאן הוא **מאיפה** נקרא המצב
// בשתי הפונקציות שממשיכות אחרי הכניסה. זה בדיוק מה שנשבר, וזה שורה אחת שקל
// להחזיר בעריכה תמימה.

const PAGE = readFileSync(join(process.cwd(), "src/app/(site)/design/page.tsx"), "utf8");

/** גוף הפונקציה, מהשורה שפותחת אותה ועד ה-`useCallback` הבא. */
function body(name: string): string {
  const head = `const ${name} = useCallback(`;
  const start = PAGE.indexOf(head);
  expect(start, `${name} לא נמצאה`).toBeGreaterThan(-1);
  const next = PAGE.indexOf("useCallback(", start + head.length);
  return PAGE.slice(start, next > -1 ? next : PAGE.length);
}

describe("המצב שממשיך אחרי כניסה", () => {
  it("יש רפרנס שמחזיק את המצב העדכני", () => {
    expect(PAGE).toContain("const stateRef = useRef(s);");
    expect(PAGE).toContain("stateRef.current = s;");
  });

  it.each(["startGeneration", "adoptShared"])("%s קוראת את המצב מהרפרנס", (name) => {
    expect(body(name)).toContain("stateRef.current");
  });

  it("היצירה בודקת `canGenerate` על המצב המשוחזר ולא על ה-closure", () => {
    // `canGenerate(s)` כאן הוא בדיוק הבאג: על טופס ריק היא מחזירה למסך הבריף.
    const generate = body("startGeneration");
    expect(generate).toContain("canGenerate(cur)");
    expect(generate).not.toContain("canGenerate(s)");
  });

  it("העתקת עיצוב ששותף קוראת את הטוקן מהמצב המשוחזר", () => {
    // `s.fromShare` היה null אחרי חזרה מגוגל, והלחיצה על "להזמין כזה" נבלעה
    // בלי שום חיווי — `if (!token) return`.
    expect(body("adoptShared")).toContain("const token = cur.fromShare;");
  });

  it("המסלול עצמו עדיין מחובר: הכניסה ממשיכה את מה שהמתין", () => {
    expect(PAGE).toContain("if (opts?.resume ?? startAfterSignIn.current)");
    expect(PAGE).toContain("else void startGeneration(a);");
  });
});
