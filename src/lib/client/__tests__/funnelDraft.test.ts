import { describe, expect, it, beforeEach, vi } from "vitest";
import { clearFunnelDraft, loadFunnelDraft, saveFunnelDraft } from "../funnelDraft";
import { INITIAL, type CreateState } from "@/components/create/model";

// אחסון מקומי מדומה — הטסטים רצים ב-node, ומה שנבדק כאן הוא ההתנהגות מסביב
// לאחסון ולא האחסון עצמו.
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** מצב משפך עם עבודה אמיתית: מוצר, מידה מדויקת, תיאור וכיתוב. */
const WORKED: CreateState = {
  ...INITIAL,
  product: "bracelet",
  circ: "168",
  fit: "loose",
  braceletWidth: 22,
  brief: "עלי גפן שזורים, מרווחים בקצוות",
  lettering: "נעמה",
  attrsAuto: true,
};

beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));

describe("טיוטת המשפך", () => {
  it("מה שנמדד ונכתב חוזר אחרי רענון", () => {
    saveFunnelDraft(WORKED);
    const draft = loadFunnelDraft();
    expect(draft?.product).toBe("bracelet");
    expect(draft?.circ).toBe("168");
    expect(draft?.brief).toContain("עלי גפן");
    expect(draft?.lettering).toBe("נעמה");
    expect(draft?.attrsAuto).toBe(true);
  });

  it("לפני בחירת מוצר אין עבודה לשמור — ולא נכתב כלום", () => {
    saveFunnelDraft(INITIAL);
    expect(loadFunnelDraft()).toBeNull();
  });

  it("היציאה מהחשבון מוחקת — מחשב משותף אינו מקרה קצה", () => {
    saveFunnelDraft(WORKED);
    clearFunnelDraft();
    expect(loadFunnelDraft()).toBeNull();
  });

  it("מה שנקרא מהדיסק אינו מה שנכתב אליו: זבל נזרק ולא מגיע למשפך", () => {
    localStorage.setItem("aperta.create.draft", "{ not json");
    expect(loadFunnelDraft()).toBeNull();

    localStorage.setItem(
      "aperta.create.draft",
      JSON.stringify({
        product: "necklace", // מוצר שאינו קיים
        fit: "super-tight", // ערך שאינו בקבוצה
        braceletWidth: -5, // רוחב בלתי אפשרי
        brief: "תיאור תקין",
        evil: "<script>",
      }),
    );
    const draft = loadFunnelDraft();
    expect(draft).toEqual({ brief: "תיאור תקין" });
  });

  it("פלט מנוע ומצב מסך אינם חלק מהטיוטה", () => {
    saveFunnelDraft({ ...WORKED, designId: "abc", procError: "בום", screen: "processing" });
    const raw = JSON.parse(localStorage.getItem("aperta.create.draft")!);
    expect(raw).not.toHaveProperty("designId");
    expect(raw).not.toHaveProperty("procError");
    expect(raw).not.toHaveProperty("screen");
  });
});
