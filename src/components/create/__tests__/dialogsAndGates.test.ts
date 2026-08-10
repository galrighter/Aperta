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

  it("role=dialog יושב על מכל התוכן ולא על הרקע", () => {
    // כשהוא ישב על הרקע, מה שהוכרז כדיאלוג היה השכבה שפרושה על כל המסך —
    // כלומר `aria-modal` חל על כל מה שמתחתיה, וגבול החלון שקורא-מסך מדווח
    // עליו לא היה גבול החלון. הוא צריך לשבת על אותו אלמנט שנושא `ref={box}`.
    const src = read("src/components/create/ui.tsx");
    const at = src.indexOf("ref={box}");
    expect(at, "ref={box} לא נמצא").toBeGreaterThan(-1);
    // התגית הפותחת שנושאת את ה-ref: מתחילתה ועד ה-`>` הראשון שאחריו. חיפוש
    // המחרוזת בקובץ כולו היה מוצא גם את ההערה שמסבירה את הכלל הזה.
    const tag = src.slice(src.lastIndexOf("<", at), src.indexOf(">", at));
    expect(tag).toContain('role="dialog"');
    expect(tag).toContain('aria-modal="true"');
  });
});

describe("קישור הדילוג ו-landmarks", () => {
  it("קישור הדילוג הוא היעד הראשון ומצביע ל-main", () => {
    // בלעדיו הגעה לתוכן דורשת תשע לחיצות Tab דרך הלוגו וכל שורת הניווט,
    // בכל עמוד מחדש.
    const layout = read("src/app/(site)/layout.tsx");
    expect(layout).toContain('href="#main"');
    expect(layout).toContain('id="main"');
    // `tabIndex={-1}` — בלעדיו הדילוג גולל בלי להעביר את המיקוד בפועל.
    expect(layout).toContain("tabIndex={-1}");
    // הקישור לפני הכותרת בעץ, אחרת הוא אינו היעד הראשון של Tab.
    expect(layout.indexOf('href="#main"')).toBeLessThan(layout.indexOf("<SiteHeader"));
  });

  it("לכל <nav> יש שם", () => {
    // שלושה landmarks בלי שם נקראים "ניווט, ניווט, ניווט".
    for (const p of ["src/components/site/SiteHeader.tsx", "src/components/site/SiteFooter.tsx"]) {
      const src = read(p);
      const navs = src.match(/<nav\b[^>]*/g) ?? [];
      expect(navs.length).toBeGreaterThan(0);
      for (const nav of navs) expect(nav).toContain("aria-label");
    }
  });

  it("עמוד 404 עוטף את תוכנו ב-main", () => {
    // הוא מרונדר מחוץ ל-(site)/layout ולכן אינו מקבל ממנו את ה-landmark.
    expect(read("src/app/not-found.tsx")).toContain("<main");
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
    expect(RESULT).toContain("d.resultOrderBlockedAsk");
  });

  it("מציע לבחור חלופה רק כשיש חלופה על המסך", () => {
    // רצועת ההצעות מוצגת מ-`picks.length > 1`, ולכן הנוסח שמפנה אליה חייב
    // להיות מותנה באותו תנאי בדיוק. הנוסח שהיה הזמין "לבחור חלופה אחרת"
    // תמיד — כולל במסך שבו הרצועה ריקה, שהוא בדיוק המסך של כשל ולידציה.
    expect(RESULT).toContain("picks.length > 1");
    expect(RESULT).toContain("d.resultOrderBlockedPick");
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
