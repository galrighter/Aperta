import { describe, expect, it } from "vitest";
import { parseOpenAiUsage } from "../openai";

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
