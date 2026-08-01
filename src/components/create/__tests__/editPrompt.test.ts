import { describe, it, expect } from "vitest";
import { INITIAL, buildEditPrompt, type CreateState } from "../model";

const state = (patch: Partial<CreateState>): CreateState => ({ ...INITIAL, ...patch });

describe("buildEditPrompt", () => {
  it("asks for the change, and says where", () => {
    expect(buildEditPrompt(state({ editReq: "לדלל את החיתוכים", region: "right" })))
      .toBe("שינוי באזור ימין של הפריט: לדלל את החיתוכים");
    expect(buildEditPrompt(state({ editReq: "לדלל את החיתוכים", region: "all" })))
      .toBe("שינוי בעיצוב כולו: לדלל את החיתוכים");
  });

  // ה"כוונון המהיר" הוסר. הפרומפט נושא את מה שהלקוחה כתבה ואת האזור שסימנה,
  // ולא מספרים שהיא לא בחרה — אלה דחפו את המודל לצפיפות אחרת בכל שינוי, קטן
  // ככל שיהיה, בדיוק במקום שבו התבקש לשמר את מה שלא התבקש להשתנות.
  it("carries nothing beyond the request and the region", () => {
    const p = buildEditPrompt(state({ editReq: "פחות חיתוכים" }));
    expect(p).toBe("שינוי בעיצוב כולו: פחות חיתוכים");
    expect(p).not.toContain("צפיפות");
    expect(p).not.toContain("גשרים");
  });
});
