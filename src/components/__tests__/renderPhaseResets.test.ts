import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * אין DOM תחת vitest כאן (ראו `create/__tests__/dialogsAndGates.test.ts`), ולכן
 * הבדיקות קוראות את המקור. מה שהן שומרות עליו הוא בדיוק מה שנשבר בשקט.
 *
 * שלושה איפוסים הועברו מאפקט לגוף הרנדר, וכולם מאותה סיבה: אפקט רץ **אחרי**
 * הצביעה, כלומר הערך הישן הספיק להגיע למסך לפריים אחד. זה נראה כהבהוב, אף אחד
 * לא מדווח עליו, וההחזרה לאפקט נראית כמו ניקוי תמים — היא מחזירה את הבאג.
 *
 * ב-`AccountGate` זה לא היה קוסמטי: מה שהבהב היה **המייל של המשתמש הקודם**,
 * בדיוק המידע שהאיפוס נועד להסתיר.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** [קובץ, שם, המשתנה שזוכר את הערך הקודם, ה-state שמתאפס] */
const RESETS = [
  ["src/components/create/AccountGate.tsx", "AccountGate", "wasOpen", "setEmail"],
  ["src/components/create/ProgressBar.tsx", "ProgressBar", "wasActive", "setProgress"],
  ["src/components/site/SiteHeader.tsx", "SiteHeader", "seenPath", "setOpen"],
] as const;

describe("איפוס state בגוף הרנדר, לא באפקט", () => {
  for (const [path, name, memo, setter] of RESETS) {
    it(`${name} מאפס לפני הצביעה`, () => {
      const src = read(path);
      // התבנית של React ל"התאמת state כשמשתנה prop": לזכור את הערך הקודם,
      // ולהשוות אליו בגוף הרנדר.
      expect(src).toContain(`const [${memo}, `);
      const guard = new RegExp(`if \\([^)]*!== ${memo}\\)`);
      expect(src).toMatch(guard);
    });

    it(`${name} מאפס את ה-state שהבהב`, () => {
      const src = read(path);
      // האיפוס עצמו קיים בתוך השומר, ולא רק המשתנה שזוכר.
      const block = src.slice(src.search(new RegExp(`if \\([^)]*!== ${memo}\\)`)));
      expect(block.slice(0, 400)).toContain(`${setter}(`);
    });
  }

  // הכיוון ההפוך — שמישהו יחזיר את האיפוס לתוך `useEffect` — נשמר ע"י ה-linter
  // ולא כאן: `react-hooks/set-state-in-effect` נופל בדיוק על זה, והוא רץ ב-CI.
  // ניסיון לשחזר את זה בטסט טקסטואלי דווקא נכשל, ובצדק: ל-`setOpen` יש שימוש
  // לגיטימי בתוך אפקט (מאזין ה-Escape ב-`SiteHeader`), ואיסור גורף היה אוסר
  // אותו. השארתי כאן רק את מה שה-linter לא יודע לבדוק — שהתבנית קיימת.
});

describe("רמז הגרירה נקרא ממקור אחד", () => {
  // שני עותקים של אותה קריאה ל-matchMedia, ושניהם בלי הרשמה לשינויים: הרמז
  // נשאר תקוע על סוג המצביע שהיה בהרכבה. `useCoarsePointer` מחזיק את ההרשמה.
  for (const path of [
    "src/components/create/RolledStage.tsx",
    "src/components/share/SharedPiece.tsx",
  ]) {
    it(`${path.split("/").pop()} משתמש ב-useCoarsePointer`, () => {
      const src = read(path);
      expect(src).toContain("useCoarsePointer()");
      // לא לחזור ל-state מקומי שנקבע פעם אחת.
      expect(src).not.toContain("matchMedia");
    });
  }

  it("ההוק נרשם לשינויים, ולא רק קורא פעם אחת", () => {
    const src = read("src/lib/client/useCoarsePointer.ts");
    expect(src).toContain("useSyncExternalStore");
    expect(src).toContain("addEventListener");
    expect(src).toContain("removeEventListener");
  });
});

describe("השתקות set-state-in-effect", () => {
  it("כל השתקה נושאת נימוק", () => {
    // השתקה בלי סיבה הופכת בקריאה הבאה ל"היה ככה". הכלל נשאר דלוק על קוד
    // חדש רק אם כל חריגה ממנו מסבירה את עצמה.
    const files = [
      "src/app/debug/page.tsx",
      "src/components/Preview3D.tsx",
      "src/components/admin/AdminDesigns.tsx",
      "src/components/admin/OrderDetail.tsx",
      "src/components/admin/RunsLog.tsx",
      "src/components/site/DesignReadyWatch.tsx",
    ];
    let seen = 0;
    for (const f of files) {
      for (const line of read(f).split("\n")) {
        if (!line.includes("eslint-disable") || !line.includes("set-state-in-effect")) continue;
        seen++;
        expect(line, `${f}: השתקה בלי נימוק`).toMatch(/ -- \S/);
      }
    }
    // אם המספר יורד, מישהו פתר אחת מהן — וזו בשורה טובה שצריכה לעדכן את הדוח.
    // 11 → 8 ב-6.8: `AdminGate`/`AdminOrders`/`AdminInquiries` עברו ל-SWR.
    expect(seen).toBe(8);
  });
});
