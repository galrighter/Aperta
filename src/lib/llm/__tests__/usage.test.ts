import { describe, expect, it } from "vitest";
import { parseOpenAiUsage } from "../openai";
import { addLlmUsage } from "../core";

/**
 * מה שקריאת ה-LLM עלתה, בדרך מהתשובה ליומן.
 *
 * הטענה שנושאת את כל השאר היא `reasoning_tokens`. המודל של שלב העיצוב חושב,
 * והחשיבה מחויבת כפלט **ואינה מופיעה בטקסט שחוזר** — כלומר כל אומדן שנגזר
 * מאורך התשובה מפספס בדיוק את החלק היקר. זו הסיבה שהשדה נקרא ונשמר, ולכן זה
 * מה שנבדק כאן.
 */

const OPENAI = {
  prompt_tokens: 1204,
  completion_tokens: 3418,
  total_tokens: 4622,
  completion_tokens_details: { reasoning_tokens: 1920, audio_tokens: 0 },
  prompt_tokens_details: { cached_tokens: 1024 },
};

describe("parseOpenAiUsage", () => {
  it("הסכומים והפירוט נקראים", () => {
    expect(parseOpenAiUsage(OPENAI)).toEqual({
      inputTokens: 1204,
      outputTokens: 3418,
      totalTokens: 4622,
      reasoningTokens: 1920,
      cachedInputTokens: 1024,
    });
  });

  it("החשיבה היא חלק מהפלט ולא נוסף עליו", () => {
    // 3,418 פלט **מתוכם** 1,920 חשיבה. חיבור של השניים היה מכפיל את החלק
    // היקר בחשבון, וזו טעות שאי אפשר לראות מהמספר לבדו.
    const out = parseOpenAiUsage(OPENAI)!;
    expect(out.reasoningTokens!).toBeLessThan(out.outputTokens);
    expect(out.inputTokens + out.outputTokens).toBe(out.totalTokens);
  });

  it("מודל בלי פירוט — הסכומים לבדם, ולא אפסים מומצאים", () => {
    const out = parseOpenAiUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
    expect(out).toEqual({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
    expect(out).not.toHaveProperty("reasoningTokens");
  });

  it("דיווח שאין בו מספרים — אין מדידה, ולא אפס", () => {
    // אפס ביומן נקרא כקריאה שלא עלתה כלום, וזו המסקנה ההפוכה מהאמת.
    expect(parseOpenAiUsage(undefined)).toBeNull();
    expect(parseOpenAiUsage(null)).toBeNull();
    expect(parseOpenAiUsage({})).toBeNull();
    expect(parseOpenAiUsage({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })).toBeNull();
  });

  it("שדה שאינו מספר נספר כאפס, והשאר שורד", () => {
    const out = parseOpenAiUsage({ prompt_tokens: "הרבה", completion_tokens: 20, total_tokens: 30 });
    expect(out).toMatchObject({ inputTokens: 0, outputTokens: 20, totalTokens: 30 });
  });

  it("מה שאינו אובייקט אינו מדידה", () => {
    for (const bad of ["", "42", 7, true]) {
      expect(parseOpenAiUsage(bad)).toBeNull();
    }
  });
});

/**
 * חיבור שתי מדידות — מה שקורה כשהקורא מנסה שוב.
 *
 * ניסיון שנפל שולם עליו: מודל שחשב ואז החזיר JSON פסול מחויב על כל מה שהספיק.
 * זה בדיוק המקרה שבו החשבון הכי גבוה, ולכן זה המקרה שאסור לו להיעלם.
 */
describe("addLlmUsage", () => {
  const A = { inputTokens: 10, outputTokens: 100, totalTokens: 110, reasoningTokens: 60 };
  const B = { inputTokens: 20, outputTokens: 200, totalTokens: 220, reasoningTokens: 120 };

  it("הסכומים והפירוט מתחברים", () => {
    expect(addLlmUsage(A, B)).toEqual({
      inputTokens: 30, outputTokens: 300, totalTokens: 330, reasoningTokens: 180,
    });
  });

  it("אין מדידה אינו אפס", () => {
    // צד ריק מחזיר את הצד השני כמו שהוא, ושני ריקים נשארים ריקים — אחרת
    // ספק שאינו מדווח היה מייצר אפס שנראה כמו מדידה.
    expect(addLlmUsage(null, B)).toEqual(B);
    expect(addLlmUsage(A, null)).toEqual(A);
    expect(addLlmUsage(null, null)).toBeNull();
  });

  it("פירוט שדווח בצד אחד בלבד שורד", () => {
    const plain = { inputTokens: 5, outputTokens: 5, totalTokens: 10 };
    expect(addLlmUsage(A, plain)!.reasoningTokens).toBe(60);
    // ומי שאף צד לא דיווח עליו נשאר חסר, ולא אפס
    expect(addLlmUsage(plain, plain)).not.toHaveProperty("reasoningTokens");
  });
});
