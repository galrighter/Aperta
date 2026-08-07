import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * אין DOM תחת vitest כאן, ולכן הבדיקות קוראות את המקור — אותה גישה כמו
 * `components/__tests__/renderPhaseResets.test.ts`.
 *
 * מה שנשמר כאן הוא החוזה שהמסכים נשענים עליו, ושנשבר בשקט אם ישתנה: שבעה
 * מסכים החזיקו כל אחד עותק של סולם התגובות (401 / 503 / השאר), ועכשיו יש
 * אחד. שינוי בו נוגע בכולם בבת אחת.
 */

const src = readFileSync(join(process.cwd(), "src/lib/client/useAdminData.ts"), "utf8");

describe("סולם התגובות של הבק־אופיס", () => {
  it("401 הוא אובדן הרשאה, לא שגיאה שהמסך מנסח", () => {
    expect(src).toContain('res.status === 401');
    expect(src).toContain('new AuthLostError("out")');
  });

  it("404 הוא מצב תצוגה ולא כשל טעינה", () => {
    // מסך פירוט שנפתח על מזהה שנמחק צריך לומר "לא נמצא", לא "הטעינה נכשלה".
    expect(src).toContain("res.status === 404");
    expect(src).toContain("NotFoundError");
  });

  it("503 מבדיל בין מיגרציה חסרה לבין פאנל מכובה", () => {
    // שני מצבים שונים לגמרי מאחורי אותו סטטוס. ההבחנה היא לפי הקוד בגוף,
    // ואיחוד שלהם היה מציג "הפאנל מכובה" על מיגרציה שלא רצה.
    expect(src).toContain('code === "schema_outdated"');
    expect(src).toContain("SchemaOutdatedError");
    expect(src).toContain('new AuthLostError("disabled")');
  });

  /**
   * זה החוזה שמונע רגרסיה אמיתית: אילו אובדן הרשאה היה ממשיך גם ל-`onError`
   * של הקורא, כל מסך היה צריך לזהות אותו שוב כדי לא לדרוס את `"disabled"`
   * ב-`"out"` — כלומר בדיוק ההבחנה שהשורה שמעל שומרת עליה. `AdminGate` נשען
   * על זה ישירות: הוא מעביר גם `onAuthLost` וגם `onError`.
   */
  it("אובדן הרשאה יוצא דרך onAuthLost בלבד ואינו ממשיך ל-onError", () => {
    const onError = src.slice(src.indexOf("onError: (e, k, cfg)"));
    const body = onError.slice(0, onError.indexOf("},"));
    expect(body).toContain("onAuthLost?.(e.state)");
    // ה-`return` הוא כל ההבדל.
    expect(body).toMatch(/onAuthLost\?\.\(e\.state\);\s*\n\s*return;/);
  });

  it("כשל הרשאה אינו נכנס לניסיונות חוזרים", () => {
    // הוא לא חולף, וניסיון חוזר עליו רק מרעיש ביומן.
    expect(src).toContain("shouldRetryOnError: false");
  });

  it("חזרה ללשונית מרעננת — בק־אופיס נשאר פתוח שעות", () => {
    expect(src).toContain("revalidateOnFocus: true");
  });

  /**
   * מלכודת שהתגלתה כשהגעתי ל-`RunsLog`: הוא יושב מאחורי שער משלו ואינו מוסר
   * `onAuthLost`. אילו אובדן הרשאה היה מסונן תמיד, 401 שם היה נעלם לגמרי —
   * לא מטופל, וגם לא מוצג. הסינון מותנה בכך שמישהו באמת מטפל.
   */
  it("אובדן הרשאה מסונן רק כשיש מי שמטפל בו", () => {
    expect(src).toContain("error instanceof AuthLostError && onAuthLost");
    expect(src).not.toMatch(/error instanceof AuthLostError \? undefined/);
  });
});

describe("רשימה מעומדת", () => {
  it("לא מושכת מחדש את העמוד הראשון בכל \"עוד\"", () => {
    expect(src).toContain("revalidateFirstPage: false");
  });

  /**
   * בניגוד ל-`useAdminData`. חזרה ללשונית עם עשרה עמודים טעונים הייתה מייצרת
   * עשר בקשות בבת אחת, ובעימוד לפי `offset` גם מסכנת שכפול או דילוג.
   */
  it("לא מרעננת על focus — רשימה שמצטברת היא מקרה אחר", () => {
    const paged = src.slice(src.indexOf("export function useAdminPages"));
    expect(paged).toContain("revalidateOnFocus: false");
  });

  it("המפתח רואה את העמוד הקודם, כדי לתמוך גם בסמן וגם ב-offset", () => {
    expect(src).toContain("getUrl: (index: number, prev: T | null) => string | null");
  });
});

describe("המסכים שהומרו", () => {
  const CONVERTED = [
    "src/components/admin/AdminGate.tsx",
    "src/components/admin/AdminOrders.tsx",
    "src/components/admin/AdminInquiries.tsx",
    "src/components/admin/OrderDetail.tsx",
    "src/components/admin/AdminDesigns.tsx",
  ];

  for (const path of CONVERTED) {
    const s = readFileSync(join(process.cwd(), path), "utf8");
    const name = path.split("/").pop();

    it(`${name} טוען דרך ההוק המשותף`, () => {
      expect(s).toContain("useAdminData");
    });

    it(`${name} לא מחזיק עותק משלו של סולם התגובות`, () => {
      // הסימן המבחין של הטוען הוא ענף ה-503, שרק הוא היה צריך אותו.
      //
      // **לא** נבדק כאן `res.status === 401` לבדו: מוטציות (PATCH של הערה
      // ב-`OrderDetail`, למשל) עדיין מטפלות בו בעצמן, וזה לגיטימי — ההוק הוא
      // שכבת **קריאה**. איחוד גם של מסלול הכתיבה הוא מעבר נפרד; איסור גורף
      // כאן היה מסמן קוד תקין.
      expect(s).not.toContain('onAuthLost("disabled")');
      expect(s).not.toContain('code === "schema_outdated"');
    });
  }

  it("המסננים מניעים את הטעינה דרך המפתח, לא בקריאה ידנית", () => {
    // `void load(...)` בכל מקום שמשנה מסנן הוא בדיוק מה שהיה נשכח באחד מהם.
    for (const path of CONVERTED) {
      const s = readFileSync(join(process.cwd(), path), "utf8");
      expect(s, path).not.toContain("void load(");
    }
  });
});
