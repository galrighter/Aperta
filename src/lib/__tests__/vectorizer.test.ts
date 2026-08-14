import { describe, it, expect, vi } from "vitest";

// AP: canary אדום ב-14.8 — "Maximum call stack size exceeded" על עיצוב עם
// הרבה עיגולים חופפים בגדלים שונים. `polygon-clipping` (isExteriorRing /
// enclosingRing) הוא רקורסיבי בלי תקרת עומק, וגיאומטריה עם קינון עמוק מספיק
// מפילה אותו בלי קשר לגודל הקלט — ראה `src/lib/render/__tests__/frameClient.test.ts`
// לשחזור מלא דרך הצינור האמיתי. הגרסה כבר נשמרת ב-`ingestCutouts` לפני
// `previewGeometry`, ולכן זה חייב להישאר best-effort ולא להפיל את מה שכבר הצליח.
//
// `difference` מדומה כאן (ולא משוחזר מגאומטריה אמיתית) כי עומק הרקורסיה
// שמפיל את polygon-clipping תלוי בכמה מקום כבר תפוס במחסנית קריאות בזמן
// הריצה — וזה משתנה בין תהליך לתהליך. מוקאפ נותן שחזור דטרמיניסטי לדיוק
// ההתנהגות שהתיקון אחראי עליה: לא לזרוק.
vi.mock("@/lib/geometry/poly", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/geometry/poly")>();
  return { ...actual, difference: vi.fn(actual.difference) };
});

import { previewGeometry } from "@/lib/vectorizer";
import { difference, rectPolygon } from "@/lib/geometry/poly";

describe("previewGeometry", () => {
  it("returns null instead of throwing when the boolean op overflows the stack", () => {
    vi.mocked(difference).mockImplementationOnce(() => {
      throw new RangeError("Maximum call stack size exceeded");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    let result: ReturnType<typeof previewGeometry> | undefined;
    expect(() => {
      result = previewGeometry(160, 12, []);
    }).not.toThrow();
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Maximum call stack size exceeded"));

    warn.mockRestore();
  });

  it("still returns the material for ordinary geometry", () => {
    const lengthMm = 40, widthMm = 12;
    const cutUnion = [rectPolygon(5, 5, 10, 7)];

    const result = previewGeometry(lengthMm, widthMm, cutUnion);
    expect(result).not.toBeNull();
    expect(result?.cutUnion).toBe(cutUnion);
    expect(Array.isArray(result?.material)).toBe(true);
  });
});
