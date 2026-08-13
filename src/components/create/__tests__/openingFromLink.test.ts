import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// פתיחת עיצוב מקישור — `/design?resume=<id>`.
//
// לשם מוביל הכפתור שבמיילים ("לצפייה בעיצוב", "להמשיך את העיצוב"), ולשם מוביל
// גם החלון "העיצוב שלך מוכן".
// מה שהיה: העמוד נטען והציג את **תחילת המשפך** — "מה נעצב?", שני מוצרים
// לחיצים — ורק כמה שניות אחר כך, כששליפת העיצוב חזרה מהשרת, התחלף בעיצוב
// עצמו. שתי תקלות באותה שנייה: מי שלחצה על קישור לעיצוב מסוים קיבלה תחילת מסע
// חדש כתשובה, ומי שהספיקה לגעת במסך בזמן ההמתנה שינתה את המצב שהעיצוב הנשלף
// נוחת עליו (בחירת מוצר מאפסת מידות).
//
// קריאת מקור ולא הרצה, כמו שאר הטסטים של העמוד: מה שנשמר כאן הוא שהמסך
// מחליף את המשפך ולא נוסף לצידו, ושהוא יורד בכל סיום — כולל כשל וכניסה לחשבון.

const PAGE = readFileSync(join(process.cwd(), "src/app/(site)/design/page.tsx"), "utf8");
const SCREEN = readFileSync(
  join(process.cwd(), "src/components/create/OpeningScreen.tsx"),
  "utf8",
);

describe("פתיחת עיצוב מקישור", () => {
  it("`?resume=` מדליק את מסך הפתיחה לפני השליפה", () => {
    expect(PAGE).toContain("setOpening(true)");
    expect(PAGE).toContain("void resume(known ?? { id: resumeId }).finally(() => setOpening(false))");
  });

  it("מסך הפתיחה מחליף את המשפך ולא יושב מעליו", () => {
    // גם הסרגל יורד: הוא היה מסמן את שלב 1 בזמן ששולפים עיצוב גמור.
    expect(PAGE).toContain("{opening && <OpeningScreen code={openingCode} />}");
    expect(PAGE).toContain("{!opening && (");
    expect(PAGE).toContain('const showRail = s.screen !== "done" && !opening;');
  });

  it("המספר שבמייל מוצג כשהוא ידוע", () => {
    // אותו מספר שכתוב במייל — האמירה שהקישור הוביל למקום הנכון.
    expect(PAGE).toContain("setOpeningCode(designCode(known?.serial ?? null))");
    expect(SCREEN).toContain("d.codeLabel");
  });

  it("המסך מכריז על עצמו כהמתנה", () => {
    // בלי זה, למי שאינו רואה את הפס זה עמוד ריק שלא קורה בו כלום.
    expect(SCREEN).toContain('role="status"');
    expect(SCREEN).toContain('aria-live="polite"');
  });

  it("הפס הוא סריקה בלי אחוזים", () => {
    // `ProgressBar` מודד מול תקרה של דקה וחצי — נכון להרצת מנוע, שקר על
    // שליפה של שניות בודדות.
    expect(SCREEN).toContain("ap-sweep");
    expect(SCREEN).not.toContain("ProgressBar");
    const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    // בלוגיות ולא ב-transform: בעמוד RTL הסריקה חייבת להתחיל בצד שממנו קוראים.
    expect(CSS).toContain("@keyframes apSweep");
    expect(CSS).toContain("inset-inline-start: -35%");
    // ובלי תנועה — פס מלא ודומם, ולא פס שקפא מחוץ למסגרת.
    expect(CSS).toContain(".ap-sweep::after { animation: none; width: 100%; }");
  });
});
