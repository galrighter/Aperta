import { describe, expect, it } from "vitest";
import {
  DESIGN_COUNT, STORY_DESIGN, buildDesignPrompt, buildStagedRenderPrompt, parseDesignSpec,
} from "../designStage";
import { storyCanvas } from "../mode";
import { LANDSCAPE } from "@/lib/render/canvas";

/**
 * story mode — שלב הטקסט שקדם למודל התמונה.
 *
 * שלוש קבוצות טענות:
 *  1. **ההצבות** — מה שנכנס במקום ה-placeholders, ובעיקר: שום placeholder לא
 *     נשאר בטקסט שיוצא. `{USER_INPUT}` שלא הוחלף פירושו שהמודל מקבל את המילה
 *     הזו כהוראה.
 *  2. **הפענוח** — מה נחשב מפרט שמיש. מפרט חלקי גרוע ממפרט שאין: הוא מייצר
 *     תמונה שבה שורה אחת מומצאת, ואי אפשר לדעת איזו.
 *  3. **הנפילה־לאחור** — כל קלט פסול מחזיר `null`, שהוא מה שמחזיר את הצינור
 *     לפרומפט של שלב אחד.
 */

const SPEC = (n: number) => JSON.stringify({
  product_type: "bracelet",
  designs: Array.from({ length: n }, (_, i) => ({
    design_number: i + 1,
    concept: "c",
    outer_silhouette: "s",
    metal_structure: "m",
    negative_space: "ns",
    rhythm_balance: "rb",
    manufacturability: "ok",
    image_instruction: `draw ${i + 1}`,
  })),
});

describe("buildDesignPrompt", () => {
  const prompt = buildDesignPrompt({
    productType: "bracelet",
    userInput: "הקיץ שהיינו נוסעים לים",
    lengthMm: 160.4,
  });

  it("המוצר, הסיפור והאורך נכנסים במקומם", () => {
    expect(prompt).toContain('"bracelet"');
    expect(prompt).toContain("הקיץ שהיינו נוסעים לים");
    expect(prompt).toContain("LENGTH: 160.4 mm");
  });

  it("שום placeholder לא שורד", () => {
    for (const token of ["{PRODUCT_TYPE}", "{USER_INPUT}", "{LENGTH_MM}", "{WIDTH_MM}"]) {
      expect(prompt).not.toContain(token);
    }
  });

  it("המוצר מוחלף גם במבנה ה-JSON שהמודל מתבקש להחזיר", () => {
    // `{PRODUCT_TYPE}` מופיע פעמיים בתבנית — פעם בקלט ופעם כערך שהמודל אמור
    // לפלוט. השנייה חייבת להיות מוחלפת גם היא, אחרת המודל פולט את המילה.
    expect(prompt).toContain('"product_type": "bracelet"');
  });

  it("הרוחב **אינו** נמסר כמידה — הוא של העיצוב", () => {
    expect(prompt).toContain("WIDTH: not specified");
    expect(prompt).not.toMatch(/WIDTH: \d/);
  });

  it("בלי אורך: הפרומפט אומר זאת במפורש במקום להמציא מספר", () => {
    const p = buildDesignPrompt({ productType: "ring", userInput: "x" });
    expect(p).toContain("LENGTH: not specified");
    expect(p).toContain('"ring"');
  });

  it("סיפור שמכיל תווי החלפה נכנס כמו שהוא", () => {
    // `$&` ו-`$1` הם הפניות אחורה ב-`String.replace`. סיפור שמכיל אותם היה
    // משכתב את עצמו — ולכן ההחלפה נעשית דרך פונקציה.
    const p = buildDesignPrompt({ productType: "ring", userInput: "עלות $& של $1 דולר" });
    expect(p).toContain("עלות $& של $1 דולר");
  });

  it("רווחים ושורות בסיפור מתקפלים לשורה אחת", () => {
    const p = buildDesignPrompt({ productType: "ring", userInput: "  שורה\n\n  ושורה  " });
    expect(p).toContain('"שורה ושורה"');
  });
});

describe("buildStagedRenderPrompt", () => {
  it("המפרט נכנס, והסמן לא נשאר", () => {
    const p = buildStagedRenderPrompt(SPEC(3), storyCanvas());
    expect(p).toContain('"image_instruction":"draw 1"');
    expect(p).not.toContain("{STAGE_1_JSON_OUTPUT}");
  });

  it("הפרומפט אומר למודל לבצע ולא לפרש מחדש", () => {
    const p = buildStagedRenderPrompt(SPEC(3), storyCanvas());
    expect(p).toContain("execute them");
    expect(p).toContain("not to invent your own");
    // ומה שהווקטורייזר צריך ממשיך להיאמר — זה מה שלא ניתן לקצץ
    expect(p).toContain("BLACK IS METAL. WHITE IS NOT.");
    expect(p).toContain("Solid black on a pure white background");
    expect(p).toContain("no shadow");
  });

  /**
   * הצורה שהטקסט מבקש היא הצורה שנשלחת ב-`size`. עד שהיא הייתה פרמטר, המשפט
   * היה כתוב בתבנית ("ONE landscape / wide image") בזמן שהצד השני שלו נקבע
   * בקוד — שני מקומות לאותה החלטה, ומודל שמצייר לרוחב על תמונה לאורך מחזיר
   * פריט חתוך בקצוות.
   */
  it("צורת הקנבס בטקסט היא זו שנשלחת — ובמסלול Story היא לאורך", () => {
    const p = buildStagedRenderPrompt(SPEC(3), storyCanvas());
    expect(p).toContain("Create ONE portrait / tall image");
    expect(p).not.toContain("{CANVAS_SHAPE}");

    const wide = buildStagedRenderPrompt(SPEC(3), LANDSCAPE);
    expect(wide).toContain("Create ONE landscape / wide image");
  });
});

describe("parseDesignSpec", () => {
  it("שלושה כיוונים עם הוראת ציור — שמיש", () => {
    const out = parseDesignSpec(SPEC(DESIGN_COUNT));
    expect(out?.spec.designs).toHaveLength(3);
    expect(out?.spec.designs[2].image_instruction).toBe("draw 3");
  });

  it("גדר markdown נחתכת — הפרומפט מבקש בלעדיה, והמודל עוטף בכל זאת", () => {
    const out = parseDesignSpec("```json\n" + SPEC(3) + "\n```");
    expect(out?.spec.designs).toHaveLength(3);
    expect(out?.json.startsWith("{")).toBe(true);
  });

  /**
   * המספר הפך לטווח (16.8): מודל הטקסט בוחר כמה עיצובים להחזיר, כי כל עיצוב
   * הוא שורה בתמונה ומספר השורות הוא מה שקובע את היחס שייצויר. מה שנאכף כאן
   * הוא הטווח — מחוצה לו התמונה הייתה נחתכת לשורות שלא צוירו, או להפך.
   */
  it("מספר כיוונים בתוך הטווח — מתקבל", () => {
    for (const n of [3, 4, 5, 6]) {
      expect(parseDesignSpec(SPEC(n))?.spec.designs).toHaveLength(n);
    }
  });

  it("מחוץ לטווח — נדחה", () => {
    expect(parseDesignSpec(SPEC(2))).toBeNull();
    expect(parseDesignSpec(SPEC(7))).toBeNull();
  });

  it("כיוון בלי הוראת ציור — נדחה", () => {
    const spec = JSON.parse(SPEC(3));
    spec.designs[1].image_instruction = "  ";
    expect(parseDesignSpec(JSON.stringify(spec))).toBeNull();
  });

  it("כל דבר שאינו JSON של מפרט — נדחה", () => {
    for (const bad of ["", "not json", "[]", "null", '{"designs":"three"}', '{"a":1}']) {
      expect(parseDesignSpec(bad)).toBeNull();
    }
  });
});

describe("STORY_DESIGN", () => {
  it("המודל והמאמץ הם מה שנבחר, במקום אחד", () => {
    expect(STORY_DESIGN.model).toBe("gpt-5.6-luna");
    expect(STORY_DESIGN.effort).toBe("medium");
  });
});
