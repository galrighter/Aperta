import { describe, expect, it } from "vitest";
import { storyCreateBlockers } from "../createForm";

/**
 * story mode — "לחיצה על 'לתרגם את הסיפור שלי' לא עושה כלום".
 *
 * הבאג: מי שכתבה סיפור ולא בחרה תכשיט לחצה על הכפתור הראשי וקיבלה שקט מוחלט —
 * הטופס עצר, אבל המסך לא אמר על מה. מה שנבדק כאן הוא המקור לאותה תשובה: לא
 * "האם אפשר לשלוח" בלבד, אלא **מה חסר ובאיזה סדר** — הראשון ברשימה הוא זה
 * שהמסך מסמן ושהמיקוד קופץ אליו.
 */

describe("מה חוסם את השליחה במסך היצירה", () => {
  it("סיפור בלי בחירת תכשיט — חסום, ועל המוצר", () => {
    expect(storyCreateBlockers({ product: null, story: "הקיץ שהיינו נוסעים לים." }))
      .toEqual(["product"]);
  });

  it("תכשיט בלי סיפור — חסום, ועל הסיפור", () => {
    expect(storyCreateBlockers({ product: "bracelet", story: "" })).toEqual(["story"]);
  });

  it("רווחים בלבד אינם סיפור", () => {
    expect(storyCreateBlockers({ product: "ring", story: "   \n  " })).toEqual(["story"]);
  });

  it("מסך ריק — שתי החסימות, לפי סדר המסך", () => {
    expect(storyCreateBlockers({ product: null, story: "" })).toEqual(["product", "story"]);
  });

  it("תכשיט וסיפור — אין חסימה", () => {
    expect(storyCreateBlockers({ product: "ring", story: "משהו קל, עם נוכחות." })).toEqual([]);
  });
});
