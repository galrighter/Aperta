import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// כפתור "כניסה" בכותרת הוביל ל-`/design` בלבד, בלי לבקש מהעמוד לפתוח את שער
// הזיהוי. מי שלחץ עליו נחת על מסך בחירת המוצר, ומי שכבר עמד על `/design` לא
// ראה כלום — `Link` אל אותו מסלול אינו מרנדר את העמוד מחדש. שני חצאים לאותו
// כשל, ושניהם שקטים: אין שגיאה, אין ניווט, אין מה לדווח עליו.
//
// הטסט הזה שומר על שני החצאים גם יחד, כי תיקון של אחד בלי השני מחזיר בדיוק
// את אותה חוויה. כל קישור בכותרת שנושא מצב פתיחה בכתובת חייב (א) להיות `a`
// ולא `Link`, ו-(ב) שהעמוד המקבל יקרא את הפרמטר שלו.
//
// מאז שדף `/designs` נולד, "העיצובים שלי" הוא קישור לעמוד רגיל ואינו נושא
// מצב — ההגנה חלה רק על מה שעדיין נושא (`SIGN_IN_HREF`), והקישור השני נבדק
// על היעד עצמו: שהעמוד שהוא מצביע עליו באמת קיים.

const SRC = join(process.cwd(), "src");
const MENU = readFileSync(join(SRC, "components/site/AccountMenu.tsx"), "utf8");
const DESIGN_PAGE = readFileSync(join(SRC, "app/(site)/design/page.tsx"), "utf8");

/** כל `export const X_HREF = "..."` בכותרת. */
const HREFS = [...MENU.matchAll(/export const (\w+_HREF) = "([^"]+)"/g)].map(([, name, href]) => ({
  name,
  href,
  param: new URL(href, "https://x").searchParams.keys().next().value as string | undefined,
}));

/** מה שנושא מצב פתיחה בכתובת — עליו חלה ההגנה הכפולה. */
const STATEFUL = HREFS.filter((h) => h.param);

describe("header links that carry open-state", () => {
  it("finds them all", () => {
    // אם נוסף קישור שלישי והרשימות לא עודכנו — סימן שצריך להסתכל עליו.
    expect(HREFS.map((h) => h.name).sort()).toEqual(["MY_DESIGNS_HREF", "SIGN_IN_HREF"]);
    expect(STATEFUL.map((h) => h.name)).toEqual(["SIGN_IN_HREF"]);
  });

  it.each(STATEFUL.map((h) => [h.name, h] as const))(
    "%s renders as a plain anchor, never next/link",
    (_n, h) => {
      // `Link` מנווט בצד הלקוח, ולכן מ-/design אל /design?x=1 לא קורה כלום.
      // בודקים את שם התג הפותח בכל שימוש, ולא הזחה — ההזחה משתנה עם המבנה.
      const tags = [...MENU.matchAll(new RegExp(`<(\\w+)[^>]*?href=\\{${h.name}\\}`, "gs"))].map(
        (m) => m[1],
      );
      expect(tags.length).toBeGreaterThan(0);
      expect([...new Set(tags)]).toEqual(["a"]);
    },
  );

  it.each(STATEFUL.map((h) => [h.name, h] as const))(
    "%s is actually read by the design page",
    (_n, h) => {
      // קישור שנושא פרמטר שאיש אינו קורא הוא בדיוק הבאג המקורי.
      expect(DESIGN_PAGE).toContain(`params.get("${h.param}")`);
    },
  );
});

describe("the my-designs link", () => {
  const myDesigns = HREFS.find((h) => h.name === "MY_DESIGNS_HREF")!;

  it("points at the standalone designs page, and the page exists", () => {
    // קישור לעמוד שאינו קיים הוא 404 בכותרת של כל האתר.
    expect(myDesigns.href).toBe("/designs");
    expect(existsSync(join(SRC, "app/(site)/designs/page.tsx"))).toBe(true);
  });
});

describe("the sign-in link", () => {
  const signIn = HREFS.find((h) => h.name === "SIGN_IN_HREF")!;

  it("points into the funnel, where the gate lives", () => {
    expect(signIn.href.startsWith("/design")).toBe(true);
  });

  it("opens the gate without queueing a generation behind it", () => {
    // `startAfterSignIn` הוא מה שגורם ליצירה לרוץ מיד אחרי הזדהות. מי שלחץ
    // "כניסה" בכותרת לא ביקש ליצור כלום — הוא עוד לא בחר מוצר.
    const branch = DESIGN_PAGE.slice(
      DESIGN_PAGE.indexOf("if (wantsSignIn)"),
      DESIGN_PAGE.indexOf("setSavedOpen(true);"),
    );
    expect(branch).not.toBe("");
    expect(branch).toContain("startAfterSignIn.current = false");
    expect(branch).toContain("setGateOpen(true)");
  });

  it("does not treat the un-resolved account probe as signed-out", () => {
    // `account` מתחיל כ-null והבדיקה שלו רצה במקביל, ולכן קריאה שלו כאן הייתה
    // פותחת שער גם למי שכבר מחובר.
    const branch = DESIGN_PAGE.slice(
      DESIGN_PAGE.indexOf("if (wantsSignIn)"),
      DESIGN_PAGE.indexOf("setSavedOpen(true);"),
    );
    expect(branch).toContain("api\n        .account()");
  });
});
