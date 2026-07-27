import { LlmError, type LlmImage } from "./core";
import { decodeDataUrl } from "@/lib/db/storage";
import { FAB, resolveFab } from "@/lib/fabrication.config";

// יצירת רנדר של הצמיד מטקסט/השראה דרך OpenAI Images API.
// הרנדר נשלח אחר כך ל-vectorizer להמרה ל-SVG. זה החצי ש-LLM ישיר לא הצליח בו:
// מודל התמונה מייצר הדמיה יפה, וה-vectorizer הופך אותה לוקטור נקי.
//
// עלות (הפרמטר היקר ביותר בצינור — נמצא כאן במספרים כדי שלא ייעלם שוב):
//   gpt-image-1-mini · low  · 1536x1024  ≈ $0.006 להרצה  ← מה שרץ, הזול ביותר
//   gpt-image-1-mini · high · 1536x1024  ≈ $0.05
//   gpt-image-1      · high · 1536x1024  ≈ $0.25          ← מה שהיה עד 26.7
// אין נסיגה לדגם יקר יותר, בכוונה: נסיגה שקטה שעולה פי ארבעים היא בדיוק סוג
// ההוצאה שאי אפשר לראות בקוד. כשל מחזיר שגיאה מפורשת ולא חשבון מפתיע.
//
// dall-e-3, שהיה כאן כנסיגה, לא היה שבור אלא לא-קיים: dall-e-2/3 הוסרו מה-API
// ב-12.5.2026, וזה התגלה כשהתקציב נגמר ב-26.7 והענף נקרא בפעם הראשונה.
const IMAGE_MODELS = ["gpt-image-1-mini"] as const;
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

/** מודל התמונה מציית למילה טוב יותר מלספרה כשמדובר בכמות. */
const WORD: Record<number, string> = { 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX" };

/**
 * פרומפט מכוון: רנדר שטוח, top-down, פליז חם על רקע לבן — קלט אידיאלי ל-vectorizer.
 *
 * שלוש קבוצות אילוצים, ובכוונה רק שלוש:
 *  1. פרופורציה — הווקטורייזר גוזר את אורך הפס מיחס הצדדים של הרנדר, ולכן
 *     היחס הוא נתון ייצור ולא טעם. בלי אמירה מפורשת המודל מצייר פס עבה מדי
 *     (נמדד: בקשה ל-140 מ"מ חזרה כ-81).
 *  2. ייצור — חיתוך לייזר מגיליון אחד: כל המתכת חייבת להישאר מחוברת, ואי אפשר
 *     לחתוך מתחת למינימומים של resolveFab().
 *  3. רנדור — מה שהווקטורייזר צריך כדי להפריד מתכת מרקע: מתכת שחורה מט על לבן
 *     שטוח, בלי צללים. שחור-על-לבן הוא ההפרדה הגדולה ביותר שיש, ולכן הצינור
 *     עובר ל-color_key="dark" (255 פחות גווני האפור) במקום "warm" (R פחות B,
 *     שעל מתכת שחורה מחזיר אפס).
 * מה שאינו אחד מהשלושה הוא החלטת עיצוב ושייך ללקוחה, לא לפרומפט.
 *
 * ומה שבכוונה *לא* נאמר כאן: הצללית. הפרומפט קרא למוצר "strip" שמונה פעמים,
 * ביקש לצייר "exactly that proportion", ותיאר את בקשת הלקוחה כ"design intent
 * for the cut-out pattern" — שלושתם אומרים "מלבן עם חורים", ומשפט היתר היחיד
 * ("the outline can wave, taper or be scalloped") לא שרד מולם. שם עצם חוזר
 * גובר על היתר חד-פעמי, ולכן המילה הוסרה במקום להוסיף עוד הנחיה: הפרופורציה
 * מדברת על ה-bounding box, והבריף הוא לפריט כולו — הצללית בכלל זה.
 * הרישום המלא: docs/REMOVED_CONSTRAINTS.md.
 */
export function buildRenderPrompt(
  userPrompt: string,
  productType: RenderProductType = "bracelet",
  dims?: RenderDims,
  /** כמה פסים בתמונה אחת. ראה src/lib/render/panels.ts — צורת הקנבס היא
   *  הידית האמיתית על יחס הצדדים, והשורות הן גם מועמדים לבחירת הלקוחה. */
  rows = 1,
): string {
  const product = FAB.products[productType];
  const d: RenderDims = dims ?? {
    lengthMm: product.defaultLengthMm,
    widthMm: product.defaultWidthMm,
    thicknessMm: FAB.defaultThicknessMm,
  };
  const fab = resolveFab(d.thicknessMm, productType);
  const ratio = round1(d.lengthMm / d.widthMm);
  const layout =
    rows <= 1
      ? " Show the whole piece, unclipped, with plain white all around it."
      : ` LAYOUT: the image contains exactly ${WORD[rows] ?? rows} separate pieces, stacked one above another as ` +
        `${WORD[rows] ?? rows} evenly spaced horizontal rows, with plain white space between them and no line, frame, ` +
        "divider or caption of any kind. Each row is a complete piece on its own, taking up the same overall extent " +
        "as above, spanning almost the full width of the image with a thin white margin at each end. Each row is a " +
        "different variation of the same design intent: the same spirit, a different design. " +
        "Show every piece whole and unclipped.";

  const object =
    productType === "ring"
      ? "a laser-cut matte black metal ring, opened out and lying completely flat (this is the flat blank that gets rolled into a ring)"
      : "a laser-cut matte black metal bracelet cuff, opened out and lying completely flat";

  return [
    `A flat, top-down, orthographic product image of ${object}, on a completely flat pure #FFFFFF white background.`,
    "It is one single piece of solid matte black metal, cut out of one flat sheet. Its whole shape is the design's — the outline as much as what is cut out of it. Nothing here fixes the outline.",

    // פרופורציה: יחס הצדדים של הרנדר הוא שקובע את אורך הפס בהמשך הצינור.
    // המדידה חלה על השטח שהפריט תופס (bounding box), לא על צורת המתאר.
    `PROPORTIONS (this is a measurement, not a style): the piece is ${round1(d.lengthMm)}mm long and ${round1(d.widthMm)}mm wide — overall it is ${ratio} times longer than it is wide. Lay it out horizontally taking up exactly that much room, long and narrow, and do not thicken it to fill the picture — leave plenty of plain white above and below it. The measurement says how much room the piece occupies; what its outline does within that room is the design's.` + layout,

    "Wherever the metal is cut away — inside the piece and along its edges alike — the same pure white background shows through.",
    "Design intent for the piece: " + userPrompt.trim().replace(/[.\s]+$/, "") + ".",

    // ייצור: אילוץ פיזי, לא כלל סגנון. חלק מתכת מנותק פשוט נופל מהגיליון.
    `MANUFACTURING (physical constraint): the piece is cut from one sheet of ${d.thicknessMm}mm metal with a laser, so all the metal must remain a single connected piece — every part of the metal is joined to the rest, with no detached island that would simply fall out of the sheet once the cutting is done. At this scale nothing can be cut finer than ${fab.minHole}mm, and no part of the remaining metal may be thinner than ${fab.minBridgeBend}mm across, or it will not survive being rolled. Within those limits the design is free to be whatever the design intent asks.`,

    "CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO reflection, NO gradient — the background is one uniform flat white with zero shading, and the metal sits flush like a flat vector illustration.",
    "Perfectly even flat lighting, straight overhead orthographic view, no perspective, no bevel, no depth, no hands, no props. Nothing may be added around the piece: no caption, no label, no watermark, no dimension annotation and no frame around the image — but lettering that is itself part of the cut pattern is welcome when the design asks for it.",
    "Maximum contrast: the metal is one deep, uniform matte black (about #111111) with no sheen, no highlight and no colour cast, so it separates from the pure white background and from the openings as sharply as possible.",
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
 * אחרת generations מטקסט. דגם אחד בלבד — gpt-image-1-mini ב-quality נמוך.
 */
export async function generateRenderPng(
  userPrompt: string,
  inspiration: LlmImage | null,
  productType: RenderProductType = "bracelet",
  dims?: RenderDims,
  /** עוקף את הפרומפט הבנוי — לבק־אופיס בלבד, כדי לנסות ניסוחים בלי לפרוס. */
  promptOverride?: string | null,
  rows = 1,
): Promise<RenderResult> {
  const key = openaiKey();
  if (!key) throw new LlmError("OPENAI_KEY is not configured for image generation", false);

  const prompt = promptOverride?.trim() || buildRenderPrompt(userPrompt, productType, dims, rows);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  const errors: string[] = [];

  try {
    for (const model of IMAGE_MODELS) {
      const useEdit = inspiration !== null;
      try {
        let attempt: Attempt;
        if (useEdit && inspiration) {
          const { bytes } = decodeDataUrl(`data:${inspiration.mediaType};base64,${inspiration.base64}`);
          const form = new FormData();
          form.append("model", model);
          form.append("prompt", prompt);
          form.append("size", "1536x1024");
          // ברירת המחדל של edits היא quality גבוה — נאמר במפורש, אחרת נתיב
          // ההשראה משלם פי עשרה מנתיב הטקסט על אותה תמונה.
          form.append("quality", "low");
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
            // היחס 3:2 הוא מה שנשלח; הפרופורציה של הפס עצמו נאמרת בפרומפט.
            size: "1536x1024",
            quality: "low",
          };
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
