import { afterEach, describe, expect, it, vi } from "vitest";
import { runDesignStage } from "../designStage";

/**
 * story mode — הניסיון החוזר של שלב הטקסט, ומה שקורה כשגם הוא נופל.
 *
 * **למה זה נבדק ולא רק נכתב.** הכשל כאן הוא היחיד במערכת ש**אין לו קורבן
 * שיתלונן**: הלקוחה מקבלת עיצובים בכל מקרה, ממודל תמונה חזק יותר, ואינה
 * אמורה להרגיש דבר. כלומר אם הניסיון החוזר לא באמת קורה, או אם הכשל לא באמת
 * מדווח, שום דבר בעולם לא יגיד את זה — חוץ מחשבון גדול יותר בעוד שבועיים.
 *
 * שלוש הטענות: שהניסיון השני קורה, שמה ששולם עליו לא נעלם, ושהכשל חוזר עם
 * סיבה שאפשר לשלוח לבן־אדם.
 */

const { askOpenAi } = vi.hoisted(() => ({ askOpenAi: vi.fn() }));
vi.mock("@/lib/llm/openai", () => ({ askOpenAi }));

const SPEC = JSON.stringify({
  product_type: "bracelet",
  designs: [1, 2, 3].map((i) => ({ design_number: i, image_instruction: `draw ${i}` })),
});

const USAGE = { inputTokens: 1200, outputTokens: 3000, totalTokens: 4200, reasoningTokens: 1800 };

const INPUT = { productType: "bracelet" as const, userInput: "הקיץ שהיינו נוסעים לים" };

afterEach(() => {
  askOpenAi.mockReset();
  vi.restoreAllMocks();
});

describe("runDesignStage — הניסיון החוזר", () => {
  it("הצלחה בראשון — אין קריאה שנייה", async () => {
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });
    const out = await runDesignStage(INPUT);
    expect(out.ok).toBe(true);
    expect(askOpenAi).toHaveBeenCalledTimes(1);
    expect(out.ok && out.attempts).toBe(1);
  });

  it("חריגה בראשון, הצלחה בשני — ההרצה תקינה", async () => {
    askOpenAi.mockRejectedValueOnce(new Error("429 rate limited"));
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });
    const out = await runDesignStage(INPUT);
    expect(out.ok).toBe(true);
    expect(out.ok && out.attempts).toBe(2);
    expect(out.ok && out.spec.designs).toHaveLength(3);
  });

  it("JSON פסול נחשב כשל גם הוא, ומנוסה שוב", async () => {
    // תשובה שאי אפשר לקרוא נראית כמו הצלחה מבחוץ, ומבחינת הקורא היא בדיוק
    // אותו דבר: אין מפרט. שתי הצורות נובעות מאותה נדנוד אקראי.
    askOpenAi.mockResolvedValueOnce({ text: "{\"designs\": []}", usage: USAGE });
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });
    const out = await runDesignStage(INPUT);
    expect(out.ok).toBe(true);
    expect(askOpenAi).toHaveBeenCalledTimes(2);
  });

  it("מה ששולם על הניסיון שנפל נספר גם כשהשני הצליח", async () => {
    // המודל חשב, החזיר JSON פסול, וחויב במלואו. `usage` שסופר רק את הניסיון
    // המוצלח היה מציג את ההרצה היקרה ביותר כזולה ביותר.
    askOpenAi.mockResolvedValueOnce({ text: "לא JSON", usage: USAGE });
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });
    const out = await runDesignStage(INPUT);
    expect(out.usage).toEqual({
      inputTokens: 2400,
      outputTokens: 6000,
      totalTokens: 8400,
      reasoningTokens: 3600,
    });
  });

  it("שני כשלים — הסיבה חוזרת, והיא זו של האחרון", async () => {
    askOpenAi.mockRejectedValueOnce(new Error("429 rate limited"));
    askOpenAi.mockRejectedValueOnce(new Error("timed out after 90s"));
    const out = await runDesignStage(INPUT);
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(2);
    // זה מה שנשלח לתורן ולטלגרם — הודעה בלי סיבה אינה שווה כלום.
    expect(out.ok === false && out.reason).toContain("timed out");
  });

  it("שני כשלים — מה ששולם עליהם לא נעלם", async () => {
    askOpenAi.mockResolvedValueOnce({ text: "לא JSON", usage: USAGE });
    askOpenAi.mockResolvedValueOnce({ text: "גם לא", usage: USAGE });
    const out = await runDesignStage(INPUT);
    expect(out.ok).toBe(false);
    expect(out.usage?.totalTokens).toBe(8400);
  });

  it("יותר משני ניסיונות לא קורים — שניים כבר אינם מקרה", async () => {
    askOpenAi.mockRejectedValue(new Error("down"));
    await runDesignStage(INPUT);
    expect(askOpenAi).toHaveBeenCalledTimes(2);
  });

  it("ניסיון ראשון איטי מקצר את השני — התקציב הוא על השלב, לא על הקריאה", async () => {
    // הכשל היקר הוא זה שלוקח זמן: פסק זמן של 90 שנ׳ ואז עוד 90 היו מוציאים
    // שלוש דקות מבקשה שנהרגת ב-300 שנ׳, לפני שהרנדר בכלל התחיל.
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    askOpenAi.mockImplementationOnce(async () => {
      now += 100_000;                       // הניסיון הראשון בלע 100 שנ׳
      throw new Error("timed out");
    });
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });

    await runDesignStage(INPUT);
    expect(askOpenAi.mock.calls[0][0].timeoutMs).toBe(90_000);
    expect(askOpenAi.mock.calls[1][0].timeoutMs).toBe(50_000);   // 150 − 100
  });

  it("לא נשאר זמן לתשובה אמיתית — הניסיון השני לא נשלח בכלל", async () => {
    // קריאה שאין לה זמן לחזור היא רק שריפת מה שנשאר לרנדר.
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    askOpenAi.mockImplementationOnce(async () => {
      now += 140_000;
      throw new Error("timed out");
    });

    const out = await runDesignStage(INPUT);
    expect(askOpenAi).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
  });

  it("הפרומפט זהה בשני הניסיונות — זה ניסיון חוזר, לא ניסוח אחר", async () => {
    askOpenAi.mockRejectedValueOnce(new Error("boom"));
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });
    await runDesignStage(INPUT);
    expect(askOpenAi.mock.calls[0][0].userText).toBe(askOpenAi.mock.calls[1][0].userText);
  });
});
