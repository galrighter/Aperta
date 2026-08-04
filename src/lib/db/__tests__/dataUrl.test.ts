import { describe, expect, it, vi } from "vitest";

// `db/storage` מייבא את לקוח ה-supabase ברמת המודול. שתי הפונקציות שנבדקות כאן
// הן פענוח טהור ולא נוגעות בו, אבל בלי הבדל הזה הייבוא נופל בטסט.
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({}),
  ensureBucket: async () => {},
  STORAGE_BUCKET: "studio",
}));

const { dataUrlMediaType, decodeDataUrl } = await import("../storage");

// הפיצול נולד מ-`/api/generate`, ששאל את סוג המדיה פעמיים על כל תמונה מצורפת
// ושילם בכל פעם פענוח מלא של מגה־בייטים כדי לקרוא עשרים תווים.

const png = "data:image/png;base64,SGVsbG8=";

describe("dataUrlMediaType", () => {
  it("קורא את סוג המדיה", () => {
    expect(dataUrlMediaType(png)).toBe("image/png");
    expect(dataUrlMediaType("data:image/jpeg;base64,SGVsbG8=")).toBe("image/jpeg");
  });

  it("**אינו** נוגע במטען — זו כל הנקודה", () => {
    // מטען שאינו base64 חוקי כלל. אם היה כאן פענוח, השורה הזו הייתה זורקת.
    expect(dataUrlMediaType("data:image/webp;base64,!!! not base64 !!!")).toBe("image/webp");
  });

  it("סובל רווח מוביל", () => {
    expect(dataUrlMediaType(`  \n${png}`)).toBe("image/png");
  });

  it("זורק על מה שאינו data URL בבסיס64", () => {
    for (const bad of ["", "https://example.com/a.png", "data:image/png,raw", "data:;base64,AA=="]) {
      expect(() => dataUrlMediaType(bad)).toThrow("Invalid data URL");
    }
  });
});

describe("decodeDataUrl", () => {
  it("מחזיר בייטים וסוג מדיה", () => {
    const { bytes, mediaType } = decodeDataUrl(png);
    expect(mediaType).toBe("image/png");
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it("סובל רווח משני צדדיו, כמו קודם", () => {
    expect(Array.from(decodeDataUrl(`  ${png}  `).bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it("זורק על מטען ריק ועל כתובת פסולה", () => {
    expect(() => decodeDataUrl("data:image/png;base64,")).toThrow("Invalid data URL");
    expect(() => decodeDataUrl("nonsense")).toThrow("Invalid data URL");
  });
});
