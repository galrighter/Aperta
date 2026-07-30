import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { decodeDataUrl } from "@/lib/db/storage";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import { buildRenderPrompt, generateRenderPng } from "@/lib/llm/imagegen";
import { vectorizeImageDebug } from "@/lib/vectorizer";
import { persistRun } from "@/lib/runs/persist";
import type { LlmImage } from "@/lib/llm/core";

// בק־אופיס: מריץ את כל הצינור עם אבחון מלא ומחזיר את כל השלבים והקבצים.
// שומר את ההרצה ל-generation_runs (source=debug) כדי שנוכל לשוחח על התוצאות
// ביומן. מקבל פרומפט או תמונה (או שניהם). לא יוצר גרסת עיצוב.

export const maxDuration = 300;

const schema = z.object({
  prompt: z.string().max(4000).optional(),
  /** פרומפט מלא שנשלח למודל התמונה כמו שהוא, במקום הפרומפט הבנוי.
   *  מעבדת ניסוחים: מאפשר להשוות גרסאות פרומפט בלי מחזור פריסה. */
  promptOverride: z.string().max(8000).optional(),
  image: z.object({ dataUrl: z.string().max(8_000_000) }).nullable().optional(),
  heightMm: z.number().min(1).max(100).default(15),
  /** אורך הפס — נכנס לפרומפט כפרופורציה. ברירת מחדל: הערך של המוצר. */
  lengthMm: z.number().min(10).max(300).optional(),
  thicknessMm: z.number().min(0.5).max(5).optional(),
  colorKey: z.enum(["coverage", "warm", "dark", "saturation", "auto"]).default("coverage"),
  productType: z.enum(["bracelet", "ring"]).default("bracelet"),
});

const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request) {
  // השער נבדק לפני ה-try, ובכוונה: ה-catch שלמטה כותב שורת הרצה על כל כשל, ולכן
  // בדיקה בתוכו הייתה משאירה שורת יומן לכל בקשה לא מורשית — כלומר נותנת לזר
  // לכתוב למסד. כאן בקשה בלי הרשאה נעצרת בלי לגעת בכלום.
  try {
    requireAdmin(req);
  } catch (err) {
    return handleRouteError(err);
  }

  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await parseBody(req, schema);
    if (!body.prompt && !body.image && !body.promptOverride) {
      throw new ApiError("bad_request", "Provide a prompt or an image", 400);
    }

    let renderDataUrl: string | null = null;
    let renderModel: string | null = null;
    let bytes: Uint8Array;
    let mediaType: string;

    const dims = {
      lengthMm: body.lengthMm ?? FAB.products[body.productType].defaultLengthMm,
      widthMm: body.heightMm,
      thicknessMm: body.thicknessMm ?? FAB.defaultThicknessMm,
    };
    // הפרומפט נבנה כאן ונשלח כ-override, כדי שמה שנשמר ליומן יהיה בדיוק
    // המחרוזת שיצאה למודל ולא שחזור שלה.
    const renderPrompt = body.image
      ? null
      : body.promptOverride?.trim() || buildRenderPrompt(body.prompt ?? "", body.productType, dims);

    if (body.image) {
      // מסלול תמונה: הקלט הוא כבר ההדמיה.
      const dec = decodeDataUrl(body.image.dataUrl);
      if (!ALLOWED_MEDIA.has(dec.mediaType)) throw new ApiError("bad_image", `Unsupported ${dec.mediaType}`, 400);
      bytes = dec.bytes;
      mediaType = dec.mediaType;
      renderDataUrl = body.image.dataUrl;
    } else {
      // מסלול פרומפט: מייצרים הדמיה קודם (מותאם לסוג המוצר).
      const inspiration: LlmImage | null = null;
      const render = await generateRenderPng(
        body.prompt ?? "",
        inspiration,
        body.productType,
        dims,
        renderPrompt,
      );
      renderDataUrl = `data:${render.mediaType};base64,${render.base64}`;
      renderModel = render.model;
      const dec = decodeDataUrl(renderDataUrl);
      bytes = dec.bytes;
      mediaType = dec.mediaType;
    }

    // "coverage" reads the background off the image border, so it needs no
    // agreement with the render prompt — a generated render and an upload go
    // through the same key unless one is picked explicitly.
    const colorKey = body.colorKey;
    // הבק־אופיס מריץ את אותו כלל פתח מינימלי כמו הלקוחה, אחרת היומן מראה
    // גיאומטריה שלא נשלחת לאף אחד.
    const minHoleMm = resolveFab(
      body.thicknessMm ?? FAB.defaultThicknessMm,
      body.productType,
    ).minHole;
    const result = await vectorizeImageDebug(bytes, mediaType, {
      heightMm: body.heightMm,
      colorKey,
      minHoleMm,
    });

    // שומרים את ההרצה ליומן (best-effort) כדי שנוכל לשוחח עליה בבק־אופיס.
    const runError = (result as { __error?: string }).__error
      ? String((result as { __body?: string }).__body ?? "vectorizer error")
      : null;
    await persistRun({
      id: runId,
      source: "debug",
      productType: body.productType,
      prompt: body.prompt ?? null,
      colorKey,
      startedAt,
      render: { bytes, mediaType, model: renderModel },
      vectorizer: result as Record<string, unknown>,
      error: runError,
      renderPrompt,
      inputs: {
        productType: body.productType,
        lengthMm: dims.lengthMm,
        widthMm: dims.widthMm,
        thicknessMm: dims.thicknessMm,
        minHoleMm,
        colorKey,
        imageUpload: Boolean(body.image),
        promptOverride: Boolean(body.promptOverride?.trim()),
      },
    });

    return NextResponse.json({
      runId,
      render: renderDataUrl ? { dataUrl: renderDataUrl, model: renderModel } : null,
      // הפרומפט חוזר עם התשובה כדי שהמסך יוכל להראות מה נשלח בלי סיבוב נוסף
      // ליומן. זו אותה מחרוזת שנשמרה בשורה.
      renderPrompt,
      result,
    });
  } catch (err) {
    await persistRun({
      id: runId,
      source: "debug",
      startedAt,
      error: err instanceof Error ? err.message : String(err),
      vectorizer: null,
    });
    return handleRouteError(err);
  }
}
