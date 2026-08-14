import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMyDesigns, mergeMyDesigns, saveMyDesign, setMyDesignPreview } from "@/lib/client/myDesigns";

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

  it("keeps the frame each drawing lives in, next to the width that was ordered", () => {
    // הרוחב שהוזמן הוא הכיתוב על הכרטיס; המסגרת היא מה שהגרסה נחתכת בה. הכרטיס
    // צייר בתוך הראשון, וההפרש ביניהם נגזם מהפריט — זה מה שנראה על המסך.
    saveMyDesign({ ...ENTRY, widthMm: 18 });
    setMyDesignPreview("d1", { path: "M1", lengthMm: 155, widthMm: 26, cuts: 6 }, [
      { versionId: "v2", versionNo: 2, path: "M2", cuts: 6, lengthMm: 155, widthMm: 26 },
      { versionId: "v1", versionNo: 1, path: "M1", cuts: 4, lengthMm: 154, widthMm: 24 },
    ]);
    const saved = listMyDesigns()[0];
    expect(saved.widthMm).toBe(18);
    expect(saved.frameWidthMm).toBe(26);
    expect(saved.results?.map((r) => r.widthMm)).toEqual([26, 24]);
  });

  it("does nothing for a design the browser does not know", () => {
    // ההשלמה מגיעה מהשרת, שאינו מכיר את התיאור ואת הכיתוב ששמורים רק כאן.
    // כתיבה של רשומה חדשה מכאן הייתה יוצרת אותה בלעדיהם.
    setMyDesignPreview("nope", preview);
    expect(listMyDesigns()).toEqual([]);
  });
});

describe("mergeMyDesigns", () => {
  it("מביא את כל מה שבחשבון, ושומר את מה שרק הדפדפן מכיר", () => {
    saveMyDesign({ ...ENTRY, brief: "גלים", path: "M1" });
    mergeMyDesigns([
      { ...ENTRY, serial: 7, updatedAt: "2026-08-05T00:00:00.000Z" },
      { ...ENTRY, id: "d2", name: "טבעת 55", updatedAt: "2026-08-09T00:00:00.000Z" },
    ]);
    const list = listMyDesigns();
    // החדש ראשון — זה גם הסדר שהתקרה חותכת לפיו.
    expect(list.map((x) => x.id)).toEqual(["d2", "d1"]);
    const d1 = list.find((x) => x.id === "d1")!;
    expect(d1.serial).toBe(7);
    expect(d1.brief).toBe("גלים");
    expect(d1.path).toBe("M1");
  });

  it("רשימה ריקה אינה נוגעת באחסון", () => {
    // כישלון של הסנכרון מחזיר לפעמים רשימה ריקה. היא לא ראיה לכלום.
    saveMyDesign(ENTRY);
    mergeMyDesigns([]);
    expect(listMyDesigns()).toHaveLength(1);
  });
});

describe("אורך הרשימה", () => {
  // ככל שהאינדקס גדול יותר הרשומה חדשה יותר — וזו שנשמרת אחרונה.
  const entry = (i: number) => ({
    ...ENTRY,
    id: `d${i}`,
    updatedAt: `2026-08-01T00:00:${String(i).padStart(2, "0")}.000Z`,
  });

  it("שומרת יותר מ-30 עיצובים", () => {
    // הסנכרון מהחשבון מושך את כולם. התקרה הישנה חתכה אותם כאן, בשקט, ומי
    // שעיצבה ארבעים ראתה שלושים — בלי שום סימן שהשאר קיימים.
    for (let i = 0; i < 45; i++) saveMyDesign(entry(i));
    expect(listMyDesigns()).toHaveLength(45);
  });

  it("מכסת אחסון מלאה משילה ציורים, ולא רשומות", () => {
    // עד היום `setItem` שנכשל השאיר את האחסון כמו שהיה — כלומר העיצוב החדש לא
    // נשמר בכלל, והכרטיס שלו לא הופיע. הציור נמשך שוב מהשרת; רשומה שנפלה היא
    // עיצוב שנעלם.
    // מספיק לארבעים רשומות, לא מספיק לארבעים ציורים.
    const LIMIT = 9_000;
    let cell = "";
    vi.stubGlobal("localStorage", {
      getItem: () => cell || null,
      setItem: (_k: string, v: string) => {
        if (v.length > LIMIT) throw new Error("QuotaExceededError");
        cell = v;
      },
      removeItem: () => void (cell = ""),
    });

    for (let i = 0; i < 40; i++) {
      saveMyDesign({ ...entry(i), path: "M0,0L1,0L1,1Z".repeat(20) });
    }
    const list = listMyDesigns();
    expect(list).toHaveLength(40);
    // מה שנשמר עכשיו הוא מה שמסתכלים עליו — הציור שלו נשאר.
    expect(list[0].id).toBe("d39");
    expect(list[0].path).toBeTruthy();
    // ומשהו כן הושל, אחרת הטסט לא בדק כלום.
    expect(list.some((x) => !x.path)).toBe(true);
  });
});
