import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// שער החשבון במסלול הסיפור — שני כשלים שנולדו מאותה עובדה אחת.
//
// **העובדה:** ב-`/design?story=1` היצירה יוצאת לדרך בטעינת העמוד עצמה. המוצר,
// המידה והסיפור כבר נמסרו מ-`/story/create`, ולכן המסע נכנס ישר למסך ההמתנה
// ומריץ — בלי שאיש לחץ על דבר. בכל מסלול אחר עוברים לפני כן שלושה מסכים.
//
// **הכשל הראשון: כל כניסה נראתה כמו יציאה מהחשבון.** בדיקת "מי מחובר" היא
// קריאת רשת שיוצאת בטעינת העמוד, ו-`account` הוא `null` עד שהיא חוזרת. במסלול
// הרגיל התשובה חזרה מזמן לפני שנלחץ "ליצור"; כאן היצירה תמיד מקדימה אותה,
// ולכן **כל** יצירה במסלול הסיפור פתחה את שער החשבון — גם למי שמחוברת. מבחוץ:
// הכניסה לסיפור מוציאה אותך מהחשבון ודורשת הרשמה בכל פעם.
//
// **הכשל השני: Back בזמן ההרצה יצא אל גוגל.** מי שכן נדרשה להזדהות חזרה מגוגל
// לעמוד שנטען מחדש, כלומר להיסטוריה שמתחילה מאפס עם רשומה אחת. הנעילה בזמן
// הרצה (#217) עובדת מתוך `popstate`, שנורה רק על ניווט בתוך המסמך — ולכן על
// רשומה בודדת הלחיצה יצאה מהעמוד אל דף ההזדהות של גוגל, שמחזיר לשם ולא לכאן,
// בזמן שההרצה באוויר. הכניסה למסלול כבר דוחפת שתי רשומות (#219); החזרה מגוגל
// לא — כי המצב ששוחזר הוא כבר `processing`, ולכן `startGeneration` שממשיך
// אחרי הכניסה אינו דוחף רשומה משלו.
//
// הטסטים קוראים את המקור, כמו שאר הטסטים של העמוד הזה: אין כאן DOM, ומה
// שנשמר הוא ההכרעה עצמה — להמתין לבדיקה לפני שמכריזים "לא מחובר", ולבנות
// רשומה מתחת להמתנה בכל דרך שנוחתים עליה.

const PAGE = readFileSync(join(process.cwd(), "src/app/(site)/design/page.tsx"), "utf8");

/** גוף הפונקציה, מהשורה שפותחת אותה ועד ה-`useCallback` הבא. */
function body(name: string): string {
  const head = `const ${name} = useCallback(`;
  const start = PAGE.indexOf(head);
  expect(start, `${name} לא נמצאה`).toBeGreaterThan(-1);
  const next = PAGE.indexOf("useCallback(", start + head.length);
  return PAGE.slice(start, next > -1 ? next : PAGE.length);
}

describe("הבדיקה מי מחובר, כשהיצירה מקדימה אותה", () => {
  it("הבדיקה הראשונית נשמרת כפרומיס", () => {
    expect(PAGE).toContain("const accountProbe = useRef<Promise<Account | null> | null>(null);");
    expect(PAGE).toContain("accountProbe.current = probe;");
  });

  it("היא מתאפסת ברגע שהתשובה חזרה", () => {
    // בלי האיפוס, המתנה מאוחרת לפרומיס הייתה מחזירה תשובה שקדמה ליציאה
    // מהחשבון או להחלפת משתמש — כלומר יצירה בשם מי שכבר יצא.
    const at = PAGE.indexOf("accountProbe.current = probe;");
    const after = PAGE.slice(at, at + 400);
    expect(after).toContain("setAccount(a);");
    expect(after).toContain("accountProbe.current = null;");
  });

  it("היצירה ממתינה לה לפני שהיא פותחת את השער", () => {
    const generate = body("startGeneration");
    expect(generate).toContain("const who = signedIn ?? account ?? (await accountProbe.current);");
    // `account` לבדו הוא הבאג: `null` בזמן שהבדיקה באוויר אינו "אין חשבון".
    expect(generate).not.toContain("const who = signedIn ?? account;");
  });

  it("השער עדיין נפתח כשבאמת אין חשבון", () => {
    const generate = body("startGeneration");
    const gate = generate.slice(generate.indexOf("if (!who) {"));
    expect(gate).toContain('pendingAction.current = "generate";');
    expect(gate).toContain("setGateOpen(true);");
  });
});

describe("החזרה מגוגל אל מסך ההמתנה", () => {
  /** האפקט שמשחזר את המשפך מה-stash, עד לענף ה-`auth=failed`. */
  const restore = (() => {
    const start = PAGE.indexOf("const stash = popCreateState<{");
    expect(start, "אפקט השחזור לא נמצא").toBeGreaterThan(-1);
    return PAGE.slice(start, PAGE.indexOf("const failed =", start));
  })();

  it("בונה רשומה מתחת להמתנה, ולא רק מסמן אותה", () => {
    expect(restore).toContain('if (stash.state.screen === "processing") {');
    expect(restore).toContain('markScreen("brief");');
    expect(restore).toContain('pushHist("processing");');
  });

  it("כל מסך אחר נשאר סימון בלבד", () => {
    // מסך שאינו ההמתנה אינו נעול, ורשומה מיותרת מתחתיו היא לחיצת Back מתה.
    expect(restore).toContain("} else markScreen(stash.state.screen);");
  });
});

describe("ביטול השער ממסך ההמתנה", () => {
  it("יוצא מההמתנה במקום להשאיר ספינר", () => {
    // במסלול הסיפור השער נפתח מעל מסך ההמתנה. למסך הזה אין Back כל עוד לא
    // נאמר שמשהו נכשל, ולכן ביטול היה משאיר ספינר שאין מאחוריו הרצה.
    const at = PAGE.indexOf("onCancel={() => {");
    expect(at, "onCancel של השער לא נמצא").toBeGreaterThan(-1);
    expect(PAGE.slice(at, at + 800)).toContain(
      'if (stateRef.current.screen === "processing" && !runningRef.current) leaveProcessing();',
    );
  });

  it("היציאה היא נסיגה בהיסטוריה, לא דחיפה", () => {
    // דחיפת רשומת בריף מעל רשומת ההמתנה הופכת את ה-Back הבא ללחיצה מתה.
    const leave = body("leaveProcessing");
    expect(leave).toContain('?.screen === "processing"');
    expect(leave).toContain("window.history.back();");
    expect(leave).toContain('else go("brief");');
  });
});
