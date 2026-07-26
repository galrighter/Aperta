import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { getDesign } from "@/lib/db/designs";
import { decodeDataUrl, uploadFile } from "@/lib/db/storage";
import { vectorizeImageFull, ingestCutouts } from "@/lib/vectorizer";
import { persistRun } from "@/lib/runs/persist";

// מסלול 1: העלאת תמונת עיצוב (רנדר מתכתי) והמרתה ל-SVG דרך שירות ה-vectorizer.
// התמונה עוברת קונדישנינג + החלקה, וה-cutouts נכנס לצינור הקיים ונשמר כגרסה.
// כל הרצה נשמרת ל-generation_runs (כולל דחייה/שגיאה) ליומן הבק־אופיס.

export const maxDuration = 300;

const schema = z.object({
  designId: z.string().uuid(),
  image: z.object({ dataUrl: z.string().max(8_000_000) }),
  colorKey: z.enum(["warm", "dark", "saturation", "auto"]).default("auto"),
});

const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request) {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  let persisted = false;
  let designId: string | null = null;

  try {
    const body = await parseBody(req, schema);
    designId = body.designId;
    const design = await getDesign(body.designId);

    const { bytes, mediaType } = decodeDataUrl(body.image.dataUrl);
    if (!ALLOWED_MEDIA.has(mediaType)) {
      throw new ApiError("bad_image", `Unsupported image type ${mediaType}`, 400);
    }

    // שומרים את התמונה שהועלתה כדי שאפשר יהיה להציג אותה לצד השרטוט.
    const renderPngPath = `renders/${design.id}/${Date.now()}.png`;
    await uploadFile(renderPngPath, bytes, mediaType);

    const vec = await vectorizeImageFull(bytes, mediaType, {
      heightMm: Number(design.width_mm),
      colorKey: body.colorKey,
    });

    await persistRun({
      id: runId,
      source: "upload",
      designId: design.id,
      productType: design.product_type,
      prompt: null,
      colorKey: body.colorKey,
      startedAt,
      render: { path: renderPngPath, model: null },
      vectorizer: vec.raw,
    });
    persisted = true;

    if (vec.status !== "approved" || !vec.cutoutsSvg) {
      throw new ApiError("vectorize_failed", `Vectorizer did not approve: ${vec.status}`, 422);
    }

    const { version, report, geometry, lengthMm } = await ingestCutouts({
      design,
      cutoutsSvg: vec.cutoutsSvg,
      userPrompt: null,
      renderPngPath,
      metrics: vec.metrics,
    });

    return NextResponse.json({ runId, version, report, geometry, lengthMm, vectorizer: vec.metrics });
  } catch (err) {
    if (!persisted) {
      await persistRun({
        id: runId,
        source: "upload",
        designId,
        prompt: null,
        startedAt,
        error: err instanceof Error ? err.message : String(err),
        vectorizer: null,
      });
    }
    return handleRouteError(err);
  }
}
