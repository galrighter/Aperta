import { LlmError, type LlmImage } from "./core";
import { decodeDataUrl } from "@/lib/db/storage";

// יצירת רנדר של הצמיד מטקסט/השראה דרך OpenAI Images API (gpt-image-1).
// הרנדר נשלח אחר כך ל-vectorizer להמרה ל-SVG. זה החצי ש-LLM ישיר לא הצליח בו:
// מודל התמונה מייצר הדמיה יפה, וה-vectorizer הופך אותה לוקטור נקי.

const IMAGE_MODELS = ["gpt-image-1", "dall-e-3"] as const;
const IMAGE_TIMEOUT_MS = 120_000;

export interface RenderResult {
  base64: string;
  mediaType: string;
  model: string;
}

function openaiKey(): string | undefined {
  return process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
}

export type RenderProductType = "bracelet" | "ring";

/**
 * פרומפט מכוון: רנדר שטוח, top-down, פליז חם על רקע לבן — קלט אידיאלי ל-vectorizer.
 * מותאם לסוג המוצר: צמיד = רצועה ארוכה; טבעת = רצועה קצרה ורחבה־יחסית (הטבעת
 * נחתכת שטוחה בלייזר ואז מגולגלת), כדי שההדמיה תתאים לפרופורציות של המוצר.
 */
export function buildRenderPrompt(userPrompt: string, productType: RenderProductType = "bracelet"): string {
  const piece =
    productType === "ring"
      ? {
          object: "a laser-cut brass ring band, unrolled and laid out perfectly flat and straight as a short horizontal strip (this is the flat blank that gets rolled into a ring)",
          strip: "The ring band is a single short horizontal strip of solid warm-gold brass with a decorative cut-out pattern running along it.",
          scale: "Because a ring band is narrow and short, keep the cut-out pattern simple and boldly sized relative to the small strip — a few clear repeating openings, not fine dense detail.",
        }
      : {
          object: "a laser-cut brass bracelet cuff, laid out perfectly straight and unrolled",
          strip: "The bracelet is a single long horizontal strip of solid warm-gold brass with an intricate decorative cut-out pattern.",
          scale: "Render the pattern as bold, cleanly separated cut-outs with generous openings and sturdy connecting metal bands.",
        };
  return [
    `A flat, top-down, orthographic product image of ${piece.object}, filling the full width of the frame edge to edge, on a completely flat pure #FFFFFF white background.`,
    piece.strip,
    "The cut-out openings are fully cut through, showing the same pure white background through them.",
    "Design intent for the cut-out pattern: " + userPrompt + ".",
    // אילוץ מסגרת — הסיבה המדודה לכשלי הווקטוריזציה. פתח שנוגע בקצה הפס נגזם
    // בשלב ה-crop, מתמזג עם הרקע, ומספר החורים משתנה — מה שמפיל את שער
    // הטופולוגיה גם כשכל מדדי הנאמנות עוברים. ניסוי: פתחים סגורים לגמרי
    // העלו את שיעור האישור מ-1/7 ל-2/4, והפיקו את הרנדר הראשון ששימר טופולוגיה.
    "FRAMING (important): an unbroken border of solid brass surrounds the whole pattern. Every opening is fully enclosed by metal — none of them touches, crosses, or runs off the strip's outer edge, and none is clipped by the edge of the frame. Leave a continuous solid brass margin along the top and bottom edges roughly a quarter of the strip's height, and a solid uncut section of brass at each of the two ends. Within that border the pattern is free to be as expressive as the design intent asks.",
    piece.scale + " Suitable for laser-cutting in 1.5mm brass. Avoid hair-thin lines, densely packed fine detail, or bands that nearly touch; keep clear space between adjacent openings.",
    "CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO reflection, NO gradient — the background is one uniform flat white with zero shading, and the metal sits flush like a flat vector illustration.",
    "Perfectly even flat lighting, straight overhead orthographic view, no perspective, no bevel, no depth, no hands, no props, no text, no border framing.",
    "High contrast: the brass is a clearly saturated warm gold, distinctly warmer and darker than the pure white, so the metal separates cleanly from the openings.",
  ].join(" ");
}

interface Attempt {
  ok: boolean;
  base64?: string;
  error?: string;
}

async function callImages(
  path: string,
  init: RequestInit & { signal: AbortSignal },
): Promise<Attempt> {
  const res = await fetch(`https://api.openai.com/v1/images/${path}`, init);
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  }
  const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "no image in response" };
  return { ok: true, base64: b64 };
}

/**
 * מייצר רנדר PNG של הצמיד. אם ניתנה תמונת השראה — משתמש ב-edits עם התמונה כרפרנס;
 * אחרת generations מטקסט. מנסה gpt-image-1 ואז dall-e-3.
 */
export async function generateRenderPng(
  userPrompt: string,
  inspiration: LlmImage | null,
  productType: RenderProductType = "bracelet",
): Promise<RenderResult> {
  const key = openaiKey();
  if (!key) throw new LlmError("OPENAI_KEY is not configured for image generation", false);

  const prompt = buildRenderPrompt(userPrompt, productType);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  const errors: string[] = [];

  try {
    for (const model of IMAGE_MODELS) {
      // dall-e-3 אינו תומך ב-edits עם רפרנס — משתמשים בו רק ל-generations.
      const useEdit = inspiration !== null && model === "gpt-image-1";
      try {
        let attempt: Attempt;
        if (useEdit && inspiration) {
          const { bytes } = decodeDataUrl(`data:${inspiration.mediaType};base64,${inspiration.base64}`);
          const form = new FormData();
          form.append("model", model);
          form.append("prompt", prompt);
          form.append("size", "1536x1024");
          form.append("image", new Blob([bytes as BlobPart], { type: inspiration.mediaType }), "inspiration.png");
          attempt = await callImages("edits", {
            method: "POST",
            headers: { authorization: `Bearer ${key}` },
            body: form,
            signal: controller.signal,
          });
        } else {
          const body: Record<string, unknown> = {
            model,
            prompt,
            n: 1,
            size: model === "gpt-image-1" ? "1536x1024" : "1792x1024",
          };
          if (model === "gpt-image-1") body.quality = "high";
          else body.response_format = "b64_json";
          attempt = await callImages("generations", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        }
        if (attempt.ok && attempt.base64) {
          return { base64: attempt.base64, mediaType: "image/png", model };
        }
        errors.push(`${model}: ${attempt.error}`);
      } catch (e) {
        if (controller.signal.aborted) throw new LlmError("Image generation timed out", true);
        errors.push(`${model}: ${(e as Error).message}`);
      }
    }
  } finally {
    clearTimeout(timer);
  }

  throw new LlmError(`Image generation failed. ${errors.join(" | ")}`, true);
}
