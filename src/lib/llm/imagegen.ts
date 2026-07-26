import { LlmError, type LlmImage } from "./core";
import { decodeDataUrl } from "@/lib/db/storage";
import { FAB, resolveFab } from "@/lib/fabrication.config";

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

/** מידות הפס השטוח שההדמיה מתארת. הן קובעות את הפרופורציה ואת המינימומים. */
export interface RenderDims {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * פרומפט מכוון: רנדר שטוח, top-down, פליז חם על רקע לבן — קלט אידיאלי ל-vectorizer.
 *
 * שלוש קבוצות אילוצים, ובכוונה רק שלוש:
 *  1. פרופורציה — הווקטורייזר גוזר את אורך הפס מיחס הצדדים של הרנדר, ולכן
 *     היחס הוא נתון ייצור ולא טעם. בלי אמירה מפורשת המודל מצייר פס עבה מדי
 *     (נמדד: בקשה ל-140 מ"מ חזרה כ-81).
 *  2. ייצור — חיתוך לייזר מגיליון אחד: כל המתכת חייבת להישאר מחוברת, ואי אפשר
 *     לחתוך מתחת למינימומים של resolveFab().
 *  3. רנדור — מה שהווקטורייזר צריך כדי להפריד מתכת מרקע (לבן שטוח, בלי צללים).
 * מה שאינו אחד מהשלושה הוא החלטת עיצוב ושייך ללקוחה, לא לפרומפט.
 */
export function buildRenderPrompt(
  userPrompt: string,
  productType: RenderProductType = "bracelet",
  dims?: RenderDims,
): string {
  const product = FAB.products[productType];
  const d: RenderDims = dims ?? {
    lengthMm: product.defaultLengthMm,
    widthMm: product.defaultWidthMm,
    thicknessMm: FAB.defaultThicknessMm,
  };
  const fab = resolveFab(d.thicknessMm, productType);
  const ratio = round1(d.lengthMm / d.widthMm);

  const object =
    productType === "ring"
      ? "a laser-cut brass ring band, unrolled and laid out perfectly flat and straight (this is the flat blank that gets rolled into a ring)"
      : "a laser-cut brass bracelet cuff, laid out perfectly straight and unrolled";

  return [
    `A flat, top-down, orthographic product image of ${object}, on a completely flat pure #FFFFFF white background.`,
    "The piece is a single rectangular strip of solid warm-gold brass with a pattern cut through it.",

    // פרופורציה: יחס הצדדים של הרנדר הוא שקובע את אורך הפס בהמשך הצינור.
    `PROPORTIONS (this is a measurement, not a style): the strip is ${round1(d.lengthMm)}mm long and ${round1(d.widthMm)}mm wide — it is ${ratio} times longer than it is wide. Draw it at exactly that proportion, lying horizontally: the pattern's longest extent runs along the strip's length, and its widest extent spans the strip's width. Show the whole strip, unclipped, with plain white all around it.`,

    "The cut-out openings are fully cut through, showing the same pure white background through them.",
    "Design intent for the cut-out pattern: " + userPrompt.trim().replace(/[.\s]+$/, "") + ".",

    // ייצור: אילוץ פיזי, לא כלל סגנון. חלק מתכת מנותק פשוט נופל מהגיליון.
    `MANUFACTURING (physical constraint): the strip is cut from one sheet of ${d.thicknessMm}mm brass with a laser, so all the brass must remain a single connected piece — every part of the metal is joined to the rest, with no detached island that would simply fall out of the sheet once the openings are cut. At this scale nothing can be cut finer than ${fab.minHole}mm, and no strip of remaining metal may be thinner than ${fab.minBridgeBend}mm across, or it will not survive being rolled. Within those limits the pattern is free to be whatever the design intent asks.`,

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
  dims?: RenderDims,
): Promise<RenderResult> {
  const key = openaiKey();
  if (!key) throw new LlmError("OPENAI_KEY is not configured for image generation", false);

  const prompt = buildRenderPrompt(userPrompt, productType, dims);
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
