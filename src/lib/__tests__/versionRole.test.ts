import { describe, it, expect } from "vitest";
import { versionRole, isReplaceablePick } from "@/lib/versionRole";

const RUN = "11111111-1111-4111-8111-111111111111";
const OTHER_RUN = "22222222-2222-4222-8222-222222222222";

describe("versionRole", () => {
  it("שורה שנושאת הצעות היא ההרצה עצמה", () => {
    expect(versionRole({ candidates: [{}, {}, {}], generation_id: RUN, picked_index: 0 })).toBe("run");
  });

  it("שורה בלי הצעות אבל עם הרצה ואינדקס היא בחירה", () => {
    expect(versionRole({ candidates: null, generation_id: RUN, picked_index: 2 })).toBe("pick");
  });

  it("אינדקס 0 הוא אינדקס — לא 'אין בחירה'", () => {
    // `picked_index != null` ולא `!picked_index`: 0 הוא ההצעה הראשונה, וזו
    // בדיוק ההצעה שהמנוע בוחר כברירת מחדל.
    expect(versionRole({ generation_id: RUN, picked_index: 0 })).toBe("pick");
  });

  it("גרסה ישנה (לפני 0012) אינה בחירה", () => {
    expect(versionRole({})).toBe("plain");
    expect(versionRole({ candidates: null, generation_id: null, picked_index: null })).toBe("plain");
  });

  it("אינדקס בלי מזהה הרצה אינו מספיק", () => {
    expect(versionRole({ picked_index: 1, generation_id: null })).toBe("plain");
  });

  it("רשימת הצעות ריקה אינה 'הרצה' — היא לא מציגה רצועה", () => {
    expect(versionRole({ candidates: [], generation_id: RUN, picked_index: 1 })).toBe("pick");
  });
});

describe("isReplaceablePick", () => {
  it("בחירה שנייה באותה הרצה דורסת את הראשונה", () => {
    expect(isReplaceablePick({ generation_id: RUN, picked_index: 1 }, RUN)).toBe(true);
  });

  it("בחירה בהרצה אחרת פותחת שורה משלה", () => {
    // בקשת שינוי פותחת הרצה חדשה; הבחירה בתוכה לא תדרוס את הבחירה שקדמה לה.
    expect(isReplaceablePick({ generation_id: OTHER_RUN, picked_index: 1 }, RUN)).toBe(false);
  });

  it("הגרסה שההרצה יצרה לעולם אינה נדרסת — היא נושאת את ההצעות", () => {
    expect(isReplaceablePick({ candidates: [{}, {}], generation_id: RUN, picked_index: 0 }, RUN)).toBe(
      false,
    );
  });

  it("בלי מזהה הרצה אין מה לדרוס", () => {
    expect(isReplaceablePick({ generation_id: null, picked_index: 1 }, null)).toBe(false);
  });

  it("גרסה ישנה נשמרת כמות שהיא", () => {
    expect(isReplaceablePick({}, RUN)).toBe(false);
  });
});

describe("שחזור התרחיש של RM-0061", () => {
  // נמדד בייצור: יצירה אחת עם שלוש הצעות, ואחריה חמש לחיצות — שש שורות ביומן,
  // שלוש מהן אותה גיאומטריה (אינדקס 0 חזר שלוש פעמים).
  const clicks = [1, 2, 0, 1, 0];

  it("חמש לחיצות מייצרות שורת בחירה אחת", () => {
    // מדמים את השרת: מתחילים משורת ההרצה, וכל לחיצה מכריעה דריסה מול הוספה.
    let rows: Array<{ candidates?: unknown[]; generation_id: string; picked_index: number }> = [
      { candidates: [{}, {}, {}], generation_id: RUN, picked_index: 0 },
    ];
    for (const index of clicks) {
      const source = rows[rows.length - 1];
      if (isReplaceablePick(source, RUN)) {
        rows = [...rows.slice(0, -1), { ...source, picked_index: index }];
      } else {
        rows = [...rows, { generation_id: RUN, picked_index: index }];
      }
    }
    expect(rows).toHaveLength(2);
    expect(rows[0].candidates).toHaveLength(3);
    expect(rows[1].picked_index).toBe(clicks[clicks.length - 1]);
  });
});
