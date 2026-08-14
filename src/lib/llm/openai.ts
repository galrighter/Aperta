// קריאות OpenAI API מצד שרת בלבד — fetch ישיר, אותו חוזה כמו הספק של Anthropic.

import { LLM_TIMEOUT_MS, LlmError, type LlmRequest } from "./core";

export function openaiModel(): string {
  return process.env.OPENAI_MODEL || "gpt-5.6-luna";
}

function openaiKey(): string | undefined {
  return process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || undefined;
}

export function hasOpenAiKey(): boolean {
  return Boolean(openaiKey());
}

export async function callOpenAi(req: LlmRequest): Promise<string> {
  const apiKey = openaiKey();
  if (!apiKey) throw new LlmError("OPENAI_KEY is not configured", false);

  const content: unknown[] = [];
  for (const img of req.images ?? []) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    });
  }
  content.push({ type: "text", text: req.userText });

  // מודל שהקורא ביקש במפורש גובר על ברירת המחדל של הסביבה: יש קריאות שהמודל
  // שלהן הוא החלטה של הקורא ולא הגדרה גלובלית.
  const model = req.model || openaiModel();
  const body: Record<string, unknown> = {
    model,
    // מודלי reasoning צורכים טוקנים "פנימיים" מתוך אותה מכסה — משאירים מרווח.
    max_completion_tokens: req.maxTokens ?? 16_384,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content },
    ],
  };
  // מודלי -chat אינם מודלי reasoning ודוחים את הפרמטר; לשאר —
  // "medium" חורג ממגבלת ה-120s על יצירת SVG מלא, "low" מהיר ועדיין חושב
  if (/^(gpt-5|o\d)/.test(model) && !model.includes("-chat")) {
    body.reasoning_effort = req.reasoningEffort || process.env.OPENAI_REASONING_EFFORT || "low";
  }

  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? LLM_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const retriable = res.status === 429 || res.status >= 500;
      throw new LlmError(`OpenAI API ${res.status}: ${errBody.slice(0, 300)}`, retriable);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new LlmError("LLM returned empty response", true);
    return text;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new LlmError(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s`, true);
    }
    throw new LlmError(`LLM request failed: ${e instanceof Error ? e.message : e}`, true);
  } finally {
    clearTimeout(timer);
  }
}
