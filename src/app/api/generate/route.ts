import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { FAB } from "@/lib/fabrication.config";
import { getDesign, countTodayGenerations } from "@/lib/db/designs";
import { uploadFile, decodeDataUrl, signedUrl } from "@/lib/db/storage";
import { generateRenderPng } from "@/lib/llm/imagegen";
import { LlmError, type LlmImage } from "@/lib/llm/core";
import { vectorizeImageFull, ingestCutouts } from "@/lib/vectorizer";
import { persistRun } from "@/lib/runs/persist";

// יצירה במסלול ה-AI (מסלול 2): טקסט/השראה → מודל תמונה (רנדר של הצמיד) →
// קונדישנינג + vectorizer → cutouts SVG → צינור הוולידציה הקיים → גרסה.
// זה מחליף את היצירה הישירה טקסט→SVG (ש-LLM לא הצליח בה) — עכשיו דרך הדמיה.
// כל הרצה נשמרת ל-generation_runs (כולל דחייה/שגיאה) ליומן הבק־אופיס.

export const maxDuration = 300;

const imageSchema = z.object({
  kind: z.enum(["inspiration", "annotation"]),
  dataUrl: z.string().max(8_000_000),
});

const schema = z.object({
  designId: z.string().uuid(),
  userPrompt: z.string().min(1).max(4000),
  currentSvg: z.string().max(500_000).nullable().optional(),
  images: z.array(imageSchema).max(3).default([]),
});

const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request) {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  let persisted = false;
  // מוחזק בהיקף חיצוני כדי שאפשר לשמור הרצת שגיאה גם אם נכשלנו מוקדם.
  let designId: string | null = null;
  let userPrompt: string | null = null;

  try {
    const body = await parseBody(req, schema);
    designId = body.designId;
    userPrompt = body.userPrompt;
    const design = await getDesign(body.designId);

    const used = await countTodayGenerations(design.profile_id);
    if (used >= FAB.DAILY_GENERATION_LIMIT) {
      throw new ApiError("rate_limited", `Daily generation limit reached (${FAB.DAILY_GENERATION_LIMIT}/day)`, 429);
    }

    // תמונת השראה (אם צורפה) משמשת רפרנס למודל התמונה.
    let inspiration: LlmImage | null = null;
    for (const img of body.images) {
      const { mediaType } = decodeDataUrl(img.dataUrl);
      if (!ALLOWED_MEDIA.has(mediaType)) {
        throw new ApiError("bad_image", `Unsupported image type ${mediaType}`, 400);
      }
      if (img.kind === "inspiration" && !inspiration) {
        inspiration = {
          mediaType: mediaType as LlmImage["mediaType"],
          base64: img.dataUrl.slice(img.dataUrl.indexOf(",") + 1),
        };
      }
    }

    // 1) יצירת רנדר של הצמיד מהתיאור (מותאם לסוג המוצר — צמיד/טבעת).
    // המידות נכנסות לפרומפט: הווקטורייזר גוזר את אורך הפס מיחס הצדדים של
    // הרנדר, ולכן היחס חייב להיות מוצהר ולא מנוחש.
    const render = await generateRenderPng(body.userPrompt, inspiration, design.product_type, {
      lengthMm: Number(design.length_mm),
      widthMm: Number(design.width_mm),
      thicknessMm: Number(design.thickness_mm),
    });
    const renderBytes = decodeDataUrl(`data:${render.mediaType};base64,${render.base64}`).bytes;

    // 2) שמירת ההדמיה כדי להציג אותה לצד השרטוט.
    const renderPngPath = `renders/${design.id}/${Date.now()}.png`;
    await uploadFile(renderPngPath, renderBytes, render.mediaType);

    // 3) המרת ההדמיה ל-cutouts SVG נקי (מצב debug כדי לשמור את כל שלבי הביניים).
    // ההדמיה היא מתכת שחורה מט על לבן, ולכן המפתח הוא "dark" (255 פחות גווני
    // האפור). "warm" — ההפרש בין ערוץ אדום לכחול — מחזיר אפס על שחור, כלומר
    // המפתח והפרומפט חייבים להשתנות יחד.
    const vec = await vectorizeImageFull(renderBytes, render.mediaType, {
      heightMm: Number(design.width_mm),
      colorKey: "dark",
    });

    // 4) שומרים את ההרצה ליומן *לפני* שמחליטים — כך גם דחיות נשמרות לאבחון.
    await persistRun({
      id: runId,
      source: "studio",
      designId: design.id,
      productType: design.product_type,
      prompt: body.userPrompt,
      colorKey: "dark",
      startedAt,
      render: { path: renderPngPath, model: render.model },
      vectorizer: vec.raw,
    });
    persisted = true;

    if (vec.status !== "approved" || !vec.cutoutsSvg) {
      throw new ApiError("vectorize_failed", `Vectorizer did not approve: ${vec.status}`, 422);
    }

    // 5) ולידציה ושמירת גרסה דרך הצינור הקיים.
    const { version, report, geometry, lengthMm } = await ingestCutouts({
      design,
      cutoutsSvg: vec.cutoutsSvg,
      derivedLength: vec.widthMm,
      userPrompt: body.userPrompt,
      renderPngPath,
      metrics: vec.metrics,
    });

    // ההדמיה חוזרת כקישור חתום ולא כ-data URL. ה-PNG שוקל ~2.3MB, כלומר ~3.1MB
    // בבסיס64 — פי עשרה משאר התשובה, ומסע היצירה של הלקוחה אפילו לא קורא אותו
    // (רק טאב הרנדר בסטודיו). תשובה כבדה על חיבור אטי נקטעת, וה-client מתרגם
    // גוף לא־תקין לשגיאה כללית — "היצירה נכשלה" על הרצה שהצליחה בשרת.
    const renderUrl = await signedUrl(renderPngPath, 3600).catch(() => null);

    return NextResponse.json({
      runId,
      version,
      report,
      geometry,
      lengthMm,
      render: { model: render.model, url: renderUrl },
      vectorizer: vec.metrics,
    });
  } catch (err) {
    // אם עוד לא שמרנו הרצה (כשל מוקדם — יצירת הדמיה, vectorizer לא זמין) — נרשום שגיאה.
    if (!persisted) {
      await persistRun({
        id: runId,
        source: "studio",
        designId,
        prompt: userPrompt,
        colorKey: "dark",
        startedAt,
        error: err instanceof Error ? err.message : String(err),
        vectorizer: null,
      });
    }
    if (err instanceof LlmError) {
      return handleRouteError(new ApiError("llm_error", err.message, err.retriable ? 502 : 500));
    }
    return handleRouteError(err);
  }
}
