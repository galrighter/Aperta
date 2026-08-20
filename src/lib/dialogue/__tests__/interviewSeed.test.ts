import { describe, expect, it } from "vitest";
import { specFromInterview } from "../seed";

/**
 * dialogue mode — הזרעת המפרט מכיווני הראיון (שלב B).
 *
 * ההבדל מ-`specFromDesignStage`, והסיבה לטסט נפרד: כיווני ראיון נושאים
 * `sources` משלהם, ומה שהלקוחה אמרה במפורש בראיון חייב להגיע לעריכה כ-`user`
 * — אחרת respec מקבל רישיון לשכתב את מה שנאמר (‏PROMPT_SPEC §1.3). זו
 * המלכודת המרכזית של שלב B, ולכן היא הטענה המרכזית כאן.
 */

const DIRECTIONS = JSON.stringify({
  product_type: "bracelet",
  designs: [
    {
      design_number: 1,
      length_to_width_ratio: 9,
      concept: "עדין וסימטרי",
      outer_silhouette: "a narrow band",
      symmetry: "mirror along the length",
      ends_treatment: "straight",
      elements: "seven ovals",
      manufacturability: "one piece",
      image_instruction: "draw it",
      sources: { outer_silhouette: "user", symmetry: "inferred", ends_treatment: "chosen", elements: "user" },
    },
    {
      design_number: 2,
      outer_silhouette: "a wavy band",
      manufacturability: "one piece",
      image_instruction: "draw it wavy",
      sources: { outer_silhouette: "user" },
    },
  ],
});

describe("specFromInterview", () => {
  it("הכיוון הנבחר מוזרע **עם המקורות שלו** — user נשאר user", () => {
    const out = specFromInterview(DIRECTIONS, 0)!;
    expect(out.outer_silhouette).toBe("a narrow band");
    expect(out.symmetry).toBe("mirror along the length");
    expect(out.length_to_width_ratio).toBe(9);
    expect(out.sources).toEqual({
      outer_silhouette: "user",
      symmetry: "inferred",
      ends_treatment: "chosen",
      elements: "user",
    });
  });

  it("‏concept ו-image_instruction אינם נכנסים — הם אינם שדות מפרט", () => {
    const out = specFromInterview(DIRECTIONS, 1)!;
    expect(Object.keys(out).sort()).toEqual(["manufacturability", "outer_silhouette", "sources"]);
  });

  it("חסר עדיף על ניחוש — בדיוק כמו בהזרעה מהיצירה", () => {
    expect(specFromInterview(null, 0)).toBeNull();
    expect(specFromInterview("not json", 0)).toBeNull();
    expect(specFromInterview(DIRECTIONS, 2)).toBeNull();
    expect(specFromInterview(DIRECTIONS, -1)).toBeNull();
    expect(specFromInterview(DIRECTIONS, 1.5)).toBeNull();
    expect(specFromInterview(DIRECTIONS, null)).toBeNull();
    // כיוון בלי אף שדה טקסט — יחס לבדו אינו מפרט.
    const bare = JSON.stringify({ designs: [{ length_to_width_ratio: 8, sources: { length_to_width_ratio: "user" } }] });
    expect(specFromInterview(bare, 0)).toBeNull();
  });
});
