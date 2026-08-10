import { describe, expect, it } from "vitest";
import { INITIAL, entryDesignId, entryFromGeneration, type CreateState } from "../model";

// תוצאת מודל = מספר עיצוב (החלטת גל, 10.8): גרסת-עריכה יושבת על דוגמה
// ממוספרת משלה, והפעולות עליה — הזמנה, שיתוף, בחירת הצעה — מצביעות עליה.

const RES = {
  version: { id: "v-9", version_no: 1, svg: "<svg/>" },
  report: null,
  geometry: null,
};

describe("שושלת הדוגמאות של עריכה", () => {
  it("גרסה שנשמרה על דוגמה נושאת את המספר שלה — עם הנקודה שמצביעה על המקור", () => {
    const entry = entryFromGeneration(
      { ...RES, design: { id: "d-child", serial: 86, root_serial: 85, sample_no: 2 } },
      { region: null, text: "לדלל את החיתוכים" },
    );
    expect(entry.designId).toBe("d-child");
    expect(entry.designCode).toBe("AP-0085.2");
  });

  it("יצירה ראשונה נושאת מספר רגיל — אין מקור להצביע עליו", () => {
    const entry = entryFromGeneration(
      { ...RES, design: { id: "d-root", serial: 85, root_serial: null, sample_no: null } },
      { region: null, text: "" },
    );
    expect(entry.designCode).toBe("AP-0085");
  });

  it("תשובת שרת ישן — בלי design — נופלת לעיצוב של המשפך", () => {
    const s: CreateState = { ...INITIAL, designId: "d-funnel" };
    const entry = entryFromGeneration(RES, { region: null, text: "" });
    expect(entry.designId).toBeUndefined();
    expect(entryDesignId(s, entry)).toBe("d-funnel");
  });

  it("הפעולה על גרסה מוצגת הולכת לעיצוב שלה, לא לעיצוב של המשפך", () => {
    const s: CreateState = { ...INITIAL, designId: "d-funnel" };
    const entry = entryFromGeneration(
      { ...RES, design: { id: "d-child", serial: 86, root_serial: 85, sample_no: 2 } },
      { region: null, text: "שינוי" },
    );
    expect(entryDesignId(s, entry)).toBe("d-child");
  });
});
