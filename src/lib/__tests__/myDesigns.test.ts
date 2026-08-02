import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMyDesigns, saveMyDesign, setMyDesignPreview } from "@/lib/client/myDesigns";

// האינדקס המקומי של "העיצובים שלי". מה שנבדק כאן הוא מה שהכרטיס מצייר: לא רק
// הגרסה האחרונה של העיצוב, אלא כל מה שהוא ייצר — שלוש יצירות על אותו פריט הן
// שלוש גרסאות שלו, והכרטיס הראה עד היום אחת מהן.

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

const ENTRY = {
  id: "d1", name: "צמיד 180", product: "bracelet" as const,
  circMm: 180, widthMm: 12, cuts: 0, updatedAt: "2026-08-01T00:00:00.000Z",
};

const preview = { path: "M0,0L1,0L1,1Z", lengthMm: 175, widthMm: 12, cuts: 9 };

describe("setMyDesignPreview", () => {
  it("keeps every result of the design, newest first", () => {
    saveMyDesign(ENTRY);
    setMyDesignPreview("d1", preview, [
      { versionId: "v3", versionNo: 3, path: "M3", cuts: 9 },
      { versionId: "v2", versionNo: 2, path: "M2", cuts: 7 },
      { versionId: "v1", versionNo: 1, path: "M1", cuts: 5 },
    ]);
    const saved = listMyDesigns()[0];
    expect(saved.path).toBe(preview.path);
    expect(saved.results?.map((r) => r.versionNo)).toEqual([3, 2, 1]);
  });

  it("drops only the result that is too big to store, not the rest", () => {
    // המכסה היא של האתר כולו. ציור אחד ענק לא אמור לקחת איתו את השורה.
    saveMyDesign(ENTRY);
    setMyDesignPreview("d1", preview, [
      { versionId: "v2", versionNo: 2, path: "M".repeat(40_001), cuts: 9 },
      { versionId: "v1", versionNo: 1, path: "M1", cuts: 5 },
    ]);
    expect(listMyDesigns()[0].results?.map((r) => r.versionNo)).toEqual([1]);
  });

  it("does nothing for a design the browser does not know", () => {
    // ההשלמה מגיעה מהשרת, שאינו מכיר את התיאור ואת הכיתוב ששמורים רק כאן.
    // כתיבה של רשומה חדשה מכאן הייתה יוצרת אותה בלעדיהם.
    setMyDesignPreview("nope", preview);
    expect(listMyDesigns()).toEqual([]);
  });
});
