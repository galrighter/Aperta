import { describe, it, expect } from "vitest";
import { decodeRunCursor, encodeRunCursor, legacyRunCursor } from "../cursor";

// כפתור "עוד 20 הרצות" נלחץ ולא קרה כלום. שני דברים יכולים לעשות את זה, ושניהם
// נבדקים כאן: סמן שנפגם בדרך (ה-`+` של אזור הזמן), וגוש הרצות שחולקות חותמת
// ויושב בדיוק על גבול העמוד.

const TS = "2026-08-03T08:41:00.100019+00:00";
const row = (id: string, created_at = TS) => ({ id, created_at });

describe("סמן העמוד", () => {
  it("נוסע בלי תו שמשנה משמעות בקידוד הכתובת", () => {
    const token = encodeRunCursor(row("11111111-1111-4111-8111-111111111111"));
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // מה שנשלח הוא מה שמתקבל, גם אחרי מסע בשורת הכתובת.
    const params = new URLSearchParams({ cursor: token });
    const round = new URLSearchParams(params.toString()).get("cursor");
    expect(round).toBe(token);
  });

  it("מחזיר את החותמת ואת המזהה כמו שהם", () => {
    const token = encodeRunCursor(row("11111111-1111-4111-8111-111111111111"));
    expect(decodeRunCursor(token)).toEqual({
      createdAt: TS,
      id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("ערך פגום הוא ראש היומן, לא שגיאה", () => {
    expect(decodeRunCursor("not-a-cursor")).toBeNull();
    expect(decodeRunCursor("")).toBeNull();
    expect(decodeRunCursor(null)).toBeNull();
  });

  it("מקבל את הסמן הישן מלשונית שנפתחה לפני הפריסה", () => {
    expect(legacyRunCursor(TS)).toEqual({ createdAt: TS, id: null });
    // וזה מה שקרה כשה-`+` הפך לרווח: ערך שאינו זמן, ושאילתה שנשענה עליו נכשלה.
    expect(legacyRunCursor("2026-08-03T08:41:00.100019 00:00")).toBeNull();
  });

  it("נושא את המזהה, ולכן הוא מצביע על שורה אחת ולא על גוש", () => {
    // שתי הרצות באותה מיקרו-שנייה הן שני סמנים שונים. בלי המזהה הן היו סמן
    // אחד, ו-`lt` עליו היה מדלג על שתיהן.
    const a = encodeRunCursor(row("cccccccc-0000-4000-8000-000000000005"));
    const b = encodeRunCursor(row("cccccccc-0000-4000-8000-000000000004"));
    expect(a).not.toBe(b);
    expect(decodeRunCursor(a)!.createdAt).toBe(decodeRunCursor(b)!.createdAt);
  });
});
