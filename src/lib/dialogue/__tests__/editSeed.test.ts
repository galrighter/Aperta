import { describe, expect, it } from "vitest";
import { chosenDesignIndex, specFromDesignStage } from "../seed";
import { designIndexesFor } from "@/app/api/generate/route";

/**
 * dialogue mode — הזרעת המפרט מהיצירה (§9.2), ושומר הסף שלה.
 *
 * **מה מסוכן כאן.** ההזרעה ממלאת את המפרט מתוך אחד מ-3–6 כיוונים, ואם היא
 * בוחרת את הכיוון הלא נכון התוצאה אינה "פחות מדויקת" — היא הצהרה בטוחה על
 * פריט אחר, שמודל הטקסט יערוך כאילו היא נכונה. כלומר **גרוע מלהתחיל ריק**.
 *
 * לכן רוב הטענות כאן הן על מתי **לא** להזריע.
 */

const SPEC = JSON.stringify({
  product_type: "bracelet",
  designs: [
    { design_number: 1, concept: "c1", outer_silhouette: "s1", metal_structure: "m1", negative_space: "n1", rhythm_balance: "r1", manufacturability: "k1", image_instruction: "draw 1" },
    { design_number: 2, concept: "c2", outer_silhouette: "s2", metal_structure: "m2", negative_space: "n2", rhythm_balance: "r2", manufacturability: "k2", image_instruction: "draw 2" },
    { design_number: 3, concept: "c3", outer_silhouette: "s3", metal_structure: "m3", negative_space: "n3", rhythm_balance: "r3", manufacturability: "k3", image_instruction: "draw 3" },
  ],
});

describe("specFromDesignStage", () => {
  it("מחזיר את החמישייה של הכיוון הנכון — במקור inferred", () => {
    // ‏inferred ולא user: הלקוחה בחרה את הכיוון כמכלול, לא אישרה כל שדה
    // בנפרד; ולא chosen — "חופשי" היה מתיר ל-respec לשכתב פריט שנבחר.
    expect(specFromDesignStage(SPEC, 1)).toEqual({
      outer_silhouette: "s2",
      metal_structure: "m2",
      negative_space: "n2",
      rhythm_balance: "r2",
      manufacturability: "k2",
      sources: {
        outer_silhouette: "inferred",
        metal_structure: "inferred",
        negative_space: "inferred",
        rhythm_balance: "inferred",
        manufacturability: "inferred",
      },
    });
  });

  it("`concept` ו-`image_instruction` **אינם** נכנסים למפרט", () => {
    // המפרט מוזרע משדות `designStage` בלבד — הזהות היא מה שמאפשר לשרשרת
    // לעבוד. `concept` הוא רקע, ו-`image_instruction` הוא הוראה לסבב
    // **ההוא**, לא תיאור של הפריט. `sources` הוא תיוג שלנו, לא שדה משם.
    const out = specFromDesignStage(SPEC, 0)!;
    expect(Object.keys(out).sort()).toEqual([
      "manufacturability", "metal_structure", "negative_space", "outer_silhouette", "rhythm_balance",
      "sources",
    ]);
  });

  it("היחס מוזרע כשהכיוון נושא אותו — ‏respec צריך ממי לרשת אותו", () => {
    const withRatio = JSON.stringify({
      designs: [{ outer_silhouette: "s1", length_to_width_ratio: 8.5 }],
    });
    const out = specFromDesignStage(withRatio, 0)!;
    expect(out.length_to_width_ratio).toBe(8.5);
    expect(out.sources?.length_to_width_ratio).toBe("inferred");
  });

  it("יחס פסול אינו מוזרע — והכיוון עדיין שמיש", () => {
    const badRatio = JSON.stringify({
      designs: [{ outer_silhouette: "s1", length_to_width_ratio: "wide" }],
    });
    const out = specFromDesignStage(badRatio, 0)!;
    expect(out.outer_silhouette).toBe("s1");
    expect(out.length_to_width_ratio).toBeUndefined();
  });

  it("יחס בלי אף שדה טקסט — null: אי אפשר לצייר מיחס לבדו", () => {
    const only = JSON.stringify({ designs: [{ length_to_width_ratio: 8 }] });
    expect(specFromDesignStage(only, 0)).toBeNull();
  });

  it("אינדקס מחוץ לתחום — null, ולא הכיוון הראשון", () => {
    expect(specFromDesignStage(SPEC, 3)).toBeNull();
    expect(specFromDesignStage(SPEC, 99)).toBeNull();
  });

  it("בלי אינדקס — null", () => {
    for (const bad of [null, undefined, -1, 1.5, NaN]) {
      expect(specFromDesignStage(SPEC, bad)).toBeNull();
    }
  });

  it("JSON חתוך — null", () => {
    // ה-JSON נחתך ב-8,000 תווים כשהוא נשמר ליומן; חיתוך באמצע הופך אותו
    // לבלתי-קריא, ומפרט חתוך אינו מפרט.
    expect(specFromDesignStage(SPEC.slice(0, 120), 0)).toBeNull();
  });

  it("כל קלט פסול אחר — null", () => {
    for (const junk of ["", "null", "[]", '{"designs":"x"}', '{"designs":[]}', '{"designs":[null]}']) {
      expect(specFromDesignStage(junk, 0)).toBeNull();
    }
  });

  it("כיוון בלי אף שדה מהחמישייה — null ולא אובייקט ריק", () => {
    // אובייקט ריק היה נספר כ"יש מפרט" ומדלג על `EDIT_SPEC_NONE`, כלומר
    // מוסר למודל כותרת בלי תוכן — הצהרה על פריט חסר צללית ומבנה.
    const only = JSON.stringify({ designs: [{ concept: "c", image_instruction: "draw" }] });
    expect(specFromDesignStage(only, 0)).toBeNull();
  });
});

describe("chosenDesignIndex", () => {
  it("ההצעה הנבחרת → הכיוון שלה", () => {
    expect(chosenDesignIndex({
      picked_index: 2,
      candidates: [{ designIndex: 0 }, { designIndex: 2 }, { designIndex: 1 }],
    })).toBe(1);
  });

  it("בלי `picked_index` — ההצעה הראשונה, שהיא הגרסה שנשמרה", () => {
    expect(chosenDesignIndex({ candidates: [{ designIndex: 5 }] })).toBe(5);
    expect(chosenDesignIndex({ picked_index: null, candidates: [{ designIndex: 5 }] })).toBe(5);
  });

  it("הצעה בלי `designIndex` — null, ולא אפס", () => {
    // אפס הוא כיוון אמיתי. גרסה ישנה שאין עליה מיפוי חייבת להיקרא כ"לא
    // ידוע", אחרת כל עיצוב שקדם לשדה הזה יוזרע מהכיוון הראשון.
    expect(chosenDesignIndex({ picked_index: 0, candidates: [{}] })).toBeNull();
    expect(chosenDesignIndex({ picked_index: 0, candidates: null })).toBeNull();
    expect(chosenDesignIndex({ picked_index: 9, candidates: [{ designIndex: 1 }] })).toBeNull();
  });
});

describe("designIndexesFor — שומר הסף של המיפוי", () => {
  const panels = (n: number) => Array.from({ length: n }, (_, i) => ({ panel: i }));

  it("שלוש שורות, שלושה פאנלים, טור אחד — המיפוי נרשם", () => {
    expect(designIndexesFor(panels(3), { rows: 3, cols: 1 }, true)).toEqual([0, 1, 2]);
  });

  it("**שורה שאבדה — null.** זה הכשל שהשומר קיים בשבילו", () => {
    // נמדד 83–95% מסירה. כששורה אובדת, כל מה שאחריה מוסט: הכיוון של עיצוב 3
    // מוצמד לעיצוב 2, בביטחון מלא.
    expect(designIndexesFor(panels(2), { rows: 3, cols: 1 }, true)).toBeNull();
  });

  it("יותר פאנלים מהמתוכנן — null", () => {
    expect(designIndexesFor(panels(4), { rows: 3, cols: 1 }, true)).toBeNull();
  });

  it("רשת — null: פאנל אינו שורה", () => {
    expect(designIndexesFor(panels(4), { rows: 2, cols: 2 }, true)).toBeNull();
  });

  it("בלי מפרט — null. אין למה למפות", () => {
    expect(designIndexesFor(panels(3), { rows: 3, cols: 1 }, false)).toBeNull();
  });

  it("מיספור פאנלים שאינו 0..n-1 — null", () => {
    // הקופסה מספרת בעצמה. מיספור אחר פירושו שהחיתוך אינו מה שההנחה מניחה.
    expect(designIndexesFor([{ panel: 1 }, { panel: 2 }, { panel: 3 }], { rows: 3, cols: 1 }, true)).toBeNull();
    expect(designIndexesFor([{ panel: 0 }, { panel: 0 }, { panel: 2 }], { rows: 3, cols: 1 }, true)).toBeNull();
  });

  it("סדר פאנלים מעורבב נשמר כמו שהוא", () => {
    // הקופסה היא שקובעת איזה פאנל הוא איזו שורה; המיקום במערך אינו ההנחה.
    expect(designIndexesFor([{ panel: 2 }, { panel: 0 }, { panel: 1 }], { rows: 3, cols: 1 }, true))
      .toEqual([2, 0, 1]);
  });
});
