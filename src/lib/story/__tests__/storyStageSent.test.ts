import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDesignPrompt, runDesignStage } from "../designStage";

/**
 * story mode — מה שנשלח למודל הטקסט נשמר, מילה במילה.
 *
 * **למה זה נבדק.** הפרומפט הזה הוא תבנית שהסיפור נכנס לתוכה, והתבנית היא
 * הידית הראשונה שמושכים כשהמפרט חוזר חלש. לכן הוא נשמר ולא נבנה מחדש בזמן
 * הצפייה — בנייה מחדש הייתה מציגה את הנוסח של היום על הרצה של שבוע שעבר.
 * הטענה שנבדקת כאן היא בדיוק זו: `sent.prompt` הוא **אותו** טקסט שהמודל קיבל,
 * ולא שחזור שלו.
 *
 * והשנייה: הוא נשמר גם כשהשלב נפל. שם הוא נחוץ יותר מכל — כשל שחוזר על אותו
 * ניסוח הוא הניסוח ולא הספק, וזה נראה רק אם הניסוח נשמר.
 */

const { askOpenAi } = vi.hoisted(() => ({ askOpenAi: vi.fn() }));
vi.mock("@/lib/llm/openai", () => ({ askOpenAi }));

const SPEC = JSON.stringify({
  product_type: "bracelet",
  designs: [1, 2, 3].map((i) => ({ design_number: i, image_instruction: `draw ${i}` })),
});

const USAGE = { inputTokens: 1200, outputTokens: 3000, totalTokens: 4200, reasoningTokens: 1800 };

const INPUT = {
  productType: "bracelet" as const,
  userInput: "הקיץ שהיינו נוסעים לים",
  lengthMm: 160,
};

afterEach(() => {
  askOpenAi.mockReset();
  vi.restoreAllMocks();
});

describe("runDesignStage — הפרומפט שנשלח נשמר", () => {
  it("בהצלחה: `sent` הוא בדיוק מה שנמסר לספק", async () => {
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });
    const out = await runDesignStage(INPUT);

    expect(out.ok).toBe(true);
    const call = askOpenAi.mock.calls[0][0] as { system: string; userText: string };
    expect(out.sent.prompt).toBe(call.userText);
    expect(out.sent.system).toBe(call.system);
  });

  it("הסיפור והאורך נכנסו לתבנית — זה מה שמסתכלים עליו", async () => {
    askOpenAi.mockResolvedValueOnce({ text: SPEC, usage: USAGE });
    const out = await runDesignStage(INPUT);

    expect(out.sent.prompt).toContain("הקיץ שהיינו נוסעים לים");
    expect(out.sent.prompt).toContain("160 mm");
    // אין תבנית שנשארה בלי ערך: `{USER_INPUT}` שנשמר כמו שהוא הוא פרומפט
    // שבור, והוא ייראה ביומן בדיוק כמו פרומפט תקין.
    expect(out.sent.prompt).not.toMatch(/\{[A-Z_]+\}/);
  });

  it("בכשל: הפרומפט נשמר גם כשלא חזרה תשובה", async () => {
    askOpenAi.mockRejectedValue(new Error("429 rate limited"));
    const out = await runDesignStage(INPUT);

    expect(out.ok).toBe(false);
    expect(out.sent.prompt).toBe(buildDesignPrompt(INPUT));
  });
});
