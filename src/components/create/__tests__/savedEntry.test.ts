import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { savedNotice } from "../savedNotice";

// "אני לוחץ בתפריט על 'העיצובים שלי' ולא עולה כלום, ובמסך הפתיחה אין את השורה
// הנפתחת."
//
// שני מסלולים שנגמרים באותו מסך, ובשניהם הלחיצה נראית כאילו לא קרתה:
//
// 1. **הרשימה לא נפתחת.** `?designs=1` מדליק דגל באפקט שקורא את הכתובת, כלומר
//    **אחרי** הרינדור הראשון — ו-`useState(defaultOpen)` כבר קרא אותו כבוי.
//    התוצאה: נחיתה על מסך בחירת המוצר, עם שורה מקופלת שאיש לא ביקש.
// 2. **הרשימה ריקה בשקט.** במכשיר שאין בו אינדקס מקומי (מכשיר חדש, אחסון
//    שנוקה) הרשימה מגיעה מהחשבון בלבד. עד שהיא חוזרת — ואם היא נכשלת — הרכיב
//    לא מרנדר כלום, וזה נראה כמו "אין לך עיצובים".

const SRC = join(process.cwd(), "src");
const CARD = readFileSync(join(SRC, "components/create/SavedDesigns.tsx"), "utf8");
const PAGE = readFileSync(join(SRC, "app/(site)/design/page.tsx"), "utf8");

describe("פתיחה מהכותרת", () => {
  it("הכרטיס גוזר את הפתיחה מהדגל, ולא קורא אותו פעם אחת במונטאז'", () => {
    // `useState(defaultOpen)` לבדו קורא את הדגל ברינדור הראשון בלבד, והדגל
    // הזה נדלק מאוחר תמיד — כלומר `?designs=1` לא היה פותח כלום.
    expect(CARD).toContain("const open = toggled ?? defaultOpen;");
    // וכבר לא מצב משלו שנקרא פעם אחת ואינו מתעדכן. (הצירוף עצמו עדיין מופיע
    // בקובץ — בהערה שמסבירה למה הוא לא שם.)
    expect(CARD).not.toMatch(/\[open, setOpen\] = useState/);
  });

  it("הדגל עצמו נדלק מ-?designs=1", () => {
    expect(PAGE).toContain("setSavedOpen(true)");
  });
});

describe("מה נאמר כשהרשימה ריקה", () => {
  const base = { items: 0, account: true, syncing: false, failed: false, requested: false };

  it("שקט כשיש מה להראות", () => {
    expect(savedNotice({ ...base, items: 3, syncing: true })).toBeNull();
    expect(savedNotice({ ...base, items: 3, failed: true })).toBeNull();
  });

  it("שקט כשאין חשבון — אין מאיפה למשוך", () => {
    expect(savedNotice({ ...base, account: false, syncing: true, requested: true })).toBeNull();
    expect(savedNotice({ ...base, account: false, failed: true })).toBeNull();
  });

  it("שקט כשהמשיכה חזרה ובאמת אין עיצובים", () => {
    expect(savedNotice({ ...base, requested: true })).toBeNull();
  });

  it("אומר שנטענת — אבל רק למי שביקש את הרשימה", () => {
    expect(savedNotice({ ...base, syncing: true, requested: true })).toBe("syncing");
    // על מסך הפתיחה הרגיל שורה שמופיעה ונעלמת היא רעש, ולא תשובה למשהו שנלחץ.
    expect(savedNotice({ ...base, syncing: true })).toBeNull();
  });

  it("אומר שנכשלה — תמיד", () => {
    // מי שיש לו עיצובים בחשבון ורואה מסך ריק צריך לדעת שזו תקלה ולא מחיקה,
    // גם אם הגיע למשפך מכיוון אחר.
    expect(savedNotice({ ...base, failed: true })).toBe("failed");
    expect(savedNotice({ ...base, failed: true, requested: true })).toBe("failed");
    // כישלון גובר על "עדיין נטענת": הניסיון האחרון הוא מה שידוע.
    expect(savedNotice({ ...base, failed: true, syncing: true, requested: true })).toBe("failed");
  });

  it("הכרטיס מרנדר את השורה הזו גם כשאין פריטים", () => {
    // התנאי המוקדם `items.length === 0` חזר עד היום `null` על כל מה שאינו
    // שגיאת פתיחה — כולל על ההודעות האלה.
    expect(CARD).toMatch(/const line = error \?\? notice;/);
  });

  it("העמוד מסמן כישלון של המשיכה מהחשבון במקום לבלוע אותו", () => {
    expect(PAGE).toContain('setSavedSync("failed")');
    expect(PAGE).toContain('setSavedSync("loading")');
  });
});
