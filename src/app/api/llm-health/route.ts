import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/llm/client";
import { openaiModel } from "@/lib/llm/openai";
import { anthropicModel } from "@/lib/llm/anthropic";

// נקודת אבחון: איזה ספק/מודל מוגדרים, ואילו מודלי gpt-5 זמינים למפתח בפועל.
// לא חושפת סודות — רק שמות מודלים וסטטוס.

export async function GET() {
  const key = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
  let openaiModels: string[] | null = null;
  let openaiError: string | null = null;
  if (key) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        openaiError = `OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`;
      } else {
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        openaiModels = (data.data ?? [])
          .map((m) => m.id)
          // גם דגמי התמונה: הם מה שעולה כסף, והשאלה "האם הדגם הזול זמין למפתח
          // הזה" צריכה להיענות בלחיצה ולא בהרצה ששולחת חיוב.
          .filter((id) => id.startsWith("gpt-5") || id.startsWith("o") || id.includes("image"))
          .sort();
      }
    } catch (e) {
      openaiError = e instanceof Error ? e.message : String(e);
    }
  } else {
    openaiError = "OPENAI_KEY is not configured";
  }
  return NextResponse.json({
    provider: resolveProvider(),
    openaiModelConfigured: openaiModel(),
    anthropicModelConfigured: anthropicModel(),
    openaiModelsAvailable: openaiModels,
    openaiError,
  });
}
