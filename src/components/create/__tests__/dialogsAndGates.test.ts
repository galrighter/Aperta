import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// אין DOM תחת vitest כאן, ולכן הבדיקות קוראות את המקור. מה שהן שומרות עליו הוא
// דווקא מה שנשבר בשקט: תכונת נגישות שהוסרה לא מפילה שום דבר, והיא לא נראית
// למי שמשתמש בעכבר. אותו דבר לגבי כפתור שחוזר להיות פעיל.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const DIALOGS = [
  ["src/components/create/ui.tsx", "Modal"],
  ["src/components/create/AccountGate.tsx", "AccountGate"],
  ["src/components/site/DesignReadyWatch.tsx", 'חלון "העיצוב מוכן"'],
] as const;

describe("דיאלוגים", () => {
  for (const [path, name] of DIALOGS) {
    it(`${name} כולא מיקוד ונסגר במקלדת`, () => {
      // `aria-modal` מבטיח לקורא-מסך שכל השאר לא רלוונטי, אבל לא מזיז את
      // המיקוד ולא כולא אותו: בלי useDialog מקלדת יוצאת אל הטופס שמאחור.
      const src = read(path);
      expect(src).toContain("useDialog");
      expect(src).toContain("ref={box}");
    });
  }

  it('חלון "העיצוב מוכן" נסגר גם בלחיצה על הרקע', () => {
    // הוא קופץ מעצמו על עמוד שהמשתמשת באמצע. עד כאן היו רק שני כפתורים.
    expect(read("src/components/site/DesignReadyWatch.tsx")).toContain("onClick={dismiss}");
  });
});

describe("תיוג השדות במשפך", () => {
  const FIELDS = [
    ["src/components/create/BriefScreen.tsx", "brief-text"],
    ["src/components/create/BriefScreen.tsx", "lettering-text"],
    ["src/components/create/SizesScreen.tsx", "exact-size"],
    ["src/components/create/ResultScreen.tsx", "edit-request"],
  ] as const;

  for (const [path, id] of FIELDS) {
    it(`${id} קשור לכותרת שלו`, () => {
      // עד כאן התיוג היחיד היה ה-placeholder — שנעלם ברגע שמקלידים, כלומר
      // בדיוק כשחוזרים לשאול מה נכתב בשדה הזה.
      const src = read(path);
      expect(src).toContain(`htmlFor="${id}"`);
      expect(src).toContain(`id="${id}"`);
    });
  }
});

describe("כפתור ההזמנה", () => {
  const RESULT = read("src/components/create/ResultScreen.tsx");

  it("כבוי בזמן שהשינוי רץ", () => {
    // השינוי מסתיים ברקע ומחליף את הגרסה. הזמנה שיצאה באמצע היא פריט אחד
    // שהוזמן ופריט אחר שיוצר.
    expect(RESULT).toContain("disabled={s.applying || status === \"fail\"}");
  });

  it('כבוי כשהכרטיס אומר "לא ניתן לייצור"', () => {
    // הסטודיו חוסם ייצוא על אותו סטטוס בדיוק; המשפך שלח את זה עד הסדנה.
    expect(RESULT).toContain("d.resultOrderBlocked");
  });

  it("מסביר למה, ולא רק מאפיר", () => {
    expect(RESULT).toContain("d.resultOrderBusy");
  });
});

describe("ניווט במשפך", () => {
  const PAGE = read("src/app/(site)/design/page.tsx");

  it("כל מעבר מסך נכנס להיסטוריה", () => {
    // שמונת המסכים חיים על כתובת אחת ובמצב בזיכרון. בלי הדחיפה, Back בנייד
    // יוצא מ-/design לגמרי — כתובת המשלוח, אישור התנאים וטקסט העריכה ביחד.
    expect(PAGE).toContain("window.history.pushState({ screen }, \"\")");
    expect(PAGE).toContain("prev.screen !== screen");
  });

  it("Back חוזר מסך אחורה במקום לצאת", () => {
    expect(PAGE).toContain('window.addEventListener("popstate", onPop)');
  });

  it("Back לא מחזיר למסך ההמתנה", () => {
    // חזרה ל-processing הייתה מציגה ספינר של הרצה שכבר הסתיימה.
    expect(PAGE).toContain('screen === "processing"');
  });
});

describe("אישור התנאים", () => {
  const SUMMARY = read("src/components/create/SummaryScreen.tsx");

  it("יש קישור לתנאים מתוך התיבה", () => {
    // מבקשים לאשר תנאים — חייבת להיות דרך לקרוא אותם.
    expect(SUMMARY).toContain('href="/terms"');
  });

  it("לחיצה על הקישור לא מסמנת את התיבה", () => {
    // הקישור מקונן בתוך כפתור התיבה; בלי עצירת ההתפשטות, קריאה בתנאים גם
    // מאשרת אותם — אישור שהלקוחה לא נתנה.
    expect(SUMMARY).toContain("onClick={(e) => e.stopPropagation()}");
  });
});
