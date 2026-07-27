import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { FAB } from "@/lib/fabrication.config";
import { getDesign, countTodayGenerations } from "@/lib/db/designs";
import { uploadFile, decodeDataUrl, signedUrl } from "@/lib/db/storage";
import { generateRenderPng } from "@/lib/llm/imagegen";
import { LlmError, type LlmImage } from "@/lib/llm/core";
import { vectorizeImageFull, ingestCutouts, frameCutouts } from "@/lib/vectorizer";
import { CANDIDATE_TARGET, planRender, splitRender } from "@/lib/render/panels";
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

    // 1) הדמיות. כמה, ובאיזו פריסה, נגזר מהיחס שהוזמן: מודל התמונה לא מצייר
    // יחס שמבקשים ממנו אלא נמשך ליחס נוח לו, וצורת הקנבס היא מה שמזיז אותו —
    // חלוקה ל-N שורות מכריחה כל שורה להיות צרה. כל שורה היא גם מועמד לבחירת
    // הלקוחה, ולכן כשמספיקה שורה אחת המועמדים מגיעים מקריאות נפרדות.
    // הנימוקים והמדידות: src/lib/render/panels.ts.
    const dims = {
      lengthMm: Number(design.length_mm),
      widthMm: Number(design.width_mm),
      thicknessMm: Number(design.thickness_mm),
    };
    const plan = planRender(dims.lengthMm / dims.widthMm, CANDIDATE_TARGET);
    const renders = await Promise.all(
      Array.from({ length: plan.calls }, () =>
        generateRenderPng(body.userPrompt, inspiration, design.product_type, dims, null, plan.rows),
      ),
    );

    // 2) שמירת ההדמיות כדי להציג אותן לצד השרטוט.
    const stamp = Date.now();
    const renderPaths = await Promise.all(
      renders.map(async (r, i) => {
        const path = `renders/${design.id}/${stamp}-${i}.png`;
        await uploadFile(path, decodeDataUrl(`data:${r.mediaType};base64,${r.base64}`).bytes, r.mediaType);
        return path;
      }),
    );
    const renderPngPath = renderPaths[0];

    // 3) חיתוך כל הדמיה לפסים, והמרת כל פס ל-cutouts SVG נקי.
    // ההדמיה היא מתכת שחורה מט על לבן, ולכן המפתח הוא "dark" (255 פחות גווני
    // האפור). "warm" — ההפרש בין ערוץ אדום לכחול — מחזיר אפס על שחור, כלומר
    // המפתח והפרומפט חייבים להשתנות יחד.
    const panels = (
      await Promise.all(
        renders.map((r) => splitRender(decodeDataUrl(`data:${r.mediaType};base64,${r.base64}`).bytes)),
      )
    ).flat();
    const vecs = await Promise.all(
      panels.map((bytes) =>
        vectorizeImageFull(bytes, "image/png", { heightMm: dims.widthMm, colorKey: "dark" }),
      ),
    );
    const vec = vecs.find((v) => v.status === "approved" && v.cutoutsSvg) ?? vecs[0];

    // 4) שומרים את ההרצה ליומן *לפני* שמחליטים — כך גם דחיות נשמרות לאבחון.
    await persistRun({
      id: runId,
      source: "studio",
      designId: design.id,
      productType: design.product_type,
      prompt: body.userPrompt,
      colorKey: "dark",
      startedAt,
      render: { path: renderPngPath, model: renders[0].model },
      vectorizer: { ...vec.raw, panels: panels.length, rows: plan.rows, calls: plan.calls },
    });
    persisted = true;

    // 5) מסגור כל מועמד למידה שהוזמנה, ודירוג: קודם מה שעובר ולידציה, ואז מי
    // שנמתח הכי פחות — כלומר מי שהמודל צייר הכי קרוב ליחס האמיתי.
    const RANK = { pass: 0, warn: 1, fail: 2 } as const;
    const candidates = vecs
      .filter((v) => v.status === "approved" && v.cutoutsSvg)
      .map((v) => frameCutouts(design, v.cutoutsSvg!))
      .sort((a, b) => RANK[a.report.status] - RANK[b.report.status] || Math.abs(a.stretch - 1) - Math.abs(b.stretch - 1));

    if (candidates.length === 0) {
      throw new ApiError("vectorize_failed", `Vectorizer did not approve any panel: ${vec.status}`, 422);
    }

    // 6) הטוב ביותר נשמר כגרסה; השאר חוזרים לבחירת הלקוחה — אבל רק אלה שאפשר
    // לייצר. הצעה שנכשלה בוולידציה אינה בחירה אלא מלכודת: היא נראית ככל השאר,
    // הלקוחה תבחר בה כי היא יפה, והמסע ייעצר בייצוא. אם *כל* המועמדים נכשלו
    // הרשימה מתרוקנת והמסך מציג את הגרסה השמורה עם הסיבה שאי אפשר לייצר אותה.
    const offered = candidates.filter((c) => c.report.status !== "fail");
    const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
      design,
      cutoutsSvg: candidates[0].framedSvg,
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
      widthMm,
      candidates: offered.map((c) => ({
        svg: c.framedSvg,
        report: c.report,
        drawnRatio: Math.round(c.drawnRatio * 100) / 100,
        stretch: Math.round(c.stretch * 1000) / 1000,
      })),
      render: { model: renders[0].model, url: renderUrl },
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
