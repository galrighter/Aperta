import { afterEach, describe, expect, it, vi } from "vitest";
import { runEditStage } from "../editStage";

/**
 * dialogue mode — הניסיון החוזר של שלב הטקסט, ומה שקורה כשגם הוא נופל.
 *
 * **למה זה נבדק ולא רק נכתב.** לכשל כאן **אין קורבן שיתלונן**: הלקוחה מקבלת
 * עריכה בכל מקרה — היא נופלת ל-`buildEditPrompt` של היום — ואינה אמורה
 * להרגיש דבר. כלומר אם הניסיון החוזר לא באמת קורה, או אם הכשל לא באמת מדווח,
 * שום דבר בעולם לא יגיד את זה: המסלול פשוט ירוץ שבוע כמסלול הישן, בתוספת
 * עלות של שלב טקסט שלא עשה כלום, והמדידה של A0 תשווה אותו לעצמו.
 *
 * זו אותה הנמקה בדיוק כמו ב-`story/__tests__/designStageRetry.test.ts`.
 */

const { askOpenAi } = vi.hoisted(() => ({ askOpenAi: vi.fn() }));
vi.mock("@/lib/llm/openai", () => ({ askOpenAi }));

const DECISION = JSON.stringify({
  scope: "the right-hand third",
  image_instruction: "Reduce the slots from seven to three.",
  preserve: ["the outer contour"],
  updated_spec: { negative_space: "three wide slots" },
});

const USAGE = { inputTokens: 900, outputTokens: 1400, totalTokens: 2300, reasoningTokens: 700 };

const INPUT = {
  productType: "bracelet" as const,
  request: "פחות בלאגן פה",
  region: "right" as const,
  spec: { outer_silhouette: "a tapering band" },
};

afterEach(() => {
  askOpenAi.mockReset();
  vi.restoreAllMocks();
});

describe("runEditStage — הניסיון החוזר", () => {
  it("הצלחה בראשון — אין קריאה שנייה", async () => {
    askOpenAi.mockResolvedValueOnce({ text: DECISION, usage: USAGE });
    const out = await runEditStage(INPUT);
    expect(out.ok).toBe(true);
    expect(askOpenAi).toHaveBeenCalledTimes(1);
    expect(out.ok && out.attempts).toBe(1);
  });

  it("חריגה בראשון, הצלחה בשני — הסבב תקין", async () => {
    askOpenAi.mockRejectedValueOnce(new Error("429 rate limited"));
    askOpenAi.mockResolvedValueOnce({ text: DECISION, usage: USAGE });
    const out = await runEditStage(INPUT);
    expect(out.ok).toBe(true);
    expect(out.ok && out.attempts).toBe(2);
    expect(out.ok && out.decision.image_instruction).toContain("seven to three");
  });

  it("JSON פסול בראשון, תקין בשני — וגם הראשון נספר בחשבון", async () => {
    // ניסיון שהחזיר זבל שולם עליו במלואו, והוא בדיוק הניסיון שאסור שייעלם:
    // הוא זה שהופך הרצה "זולה" להרצה כפולה.
    askOpenAi.mockResolvedValueOnce({ text: "אני מצטער, לא הבנתי", usage: USAGE });
    askOpenAi.mockResolvedValueOnce({ text: DECISION, usage: USAGE });
    const out = await runEditStage(INPUT);
    expect(out.ok).toBe(true);
    expect(out.ok && out.usage?.totalTokens).toBe(USAGE.totalTokens * 2);
  });

  it("שני כשלים — `ok: false` עם סיבה שאפשר לשלוח לבן־אדם", async () => {
    askOpenAi.mockRejectedValue(new Error("timeout after 60000ms"));
    const out = await runEditStage(INPUT);
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(2);
    expect(!out.ok && out.reason).toContain("timeout");
  });

  it("שני כשלים — מה שנשלח נשמר בכל מקרה", async () => {
    // דווקא בכשל זה מה שמסבירים מולו: כשל שחוזר על אותו ניסוח הוא הניסוח,
    // ולא הספק.
    askOpenAi.mockRejectedValue(new Error("boom"));
    const out = await runEditStage(INPUT);
    expect(out.sent.prompt).toContain("פחות בלאגן פה");
    expect(out.sent.system).toContain("Aperta");
  });

  it("שני כשלים — מה ששולם עליהם אינו נעלם", async () => {
    askOpenAi.mockResolvedValue({ text: "{}", usage: USAGE });
    const out = await runEditStage(INPUT);
    expect(out.ok).toBe(false);
    expect(out.usage?.totalTokens).toBe(USAGE.totalTokens * 2);
  });

  it("המפרט המצטבר מתעדכן מההחלטה, ומה שלא נגעו בו נשאר", async () => {
    askOpenAi.mockResolvedValueOnce({ text: DECISION, usage: USAGE });
    const out = await runEditStage(INPUT);
    expect(out.ok && out.spec).toEqual({
      outer_silhouette: "a tapering band",
      negative_space: "three wide slots",
    });
  });

  it("המודל והמאמץ נמסרים לספק — כך הרתמה מריצה מועמדים", async () => {
    askOpenAi.mockResolvedValueOnce({ text: DECISION, usage: USAGE });
    await runEditStage({ ...INPUT, model: "glm-5.2", effort: "low" });
    expect(askOpenAi).toHaveBeenCalledWith(expect.objectContaining({
      model: "glm-5.2",
      reasoningEffort: "low",
    }));
  });

  it("בלי מודל מפורש — המכהן", async () => {
    askOpenAi.mockResolvedValueOnce({ text: DECISION, usage: USAGE });
    await runEditStage(INPUT);
    expect(askOpenAi).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
    }));
  });

  it("תקרת ההמתנה נמוכה מברירת המחדל של הספק", async () => {
    // השלב יושב **בתוך** בקשת היצירה שנהרגת ב-300 שנ׳, ואחריו עוד רצים
    // הרנדר, המסגור והוולידציה. `LLM_TIMEOUT_MS` (120 שנ׳) היה בולע אותם.
    askOpenAi.mockResolvedValueOnce({ text: DECISION, usage: USAGE });
    await runEditStage(INPUT);
    const call = askOpenAi.mock.calls[0][0] as { timeoutMs: number };
    expect(call.timeoutMs).toBeLessThanOrEqual(60_000);
    expect(call.timeoutMs).toBeGreaterThan(0);
  });
});
