import { uploadFile } from "@/lib/db/storage";
import { insertRun, type RunSource, type RunStagePaths, type RunMetrics } from "@/lib/db/runs";
import type { ProductType } from "@/lib/fabrication.config";

// שמירת הרצת צינור אחת ליומן הבק־אופיס: מעלה את ההדמיה ואת תמונות שלבי הביניים
// ל-storage, מסיר את ה-base64 הכבד מה-debug, ומוסיף שורה ל-generation_runs.
// best-effort: כשל בשמירה לא אמור להפיל את בקשת המשתמש.

interface VectorizerImages {
  conditioned?: string;
  overlay?: string;
  difference?: string;
  rendered?: string;
}

interface VectorizerDebug {
  images?: VectorizerImages;
  [k: string]: unknown;
}

interface VectorizerPayload {
  status?: string;
  cutouts_svg?: string;
  input?: { width_mm?: number };
  metrics?: {
    iou?: number;
    vector_holes?: number;
    mean_contour_deviation_mm?: number;
    max_contour_deviation_mm?: number;
  };
  debug?: VectorizerDebug;
  [k: string]: unknown;
}

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const STAGE_KEYS: (keyof VectorizerImages)[] = ["conditioned", "overlay", "difference", "rendered"];

export interface PersistRunInput {
  id: string;
  source: RunSource;
  designId?: string | null;
  productType?: ProductType | null;
  prompt?: string | null;
  colorKey?: string | null;
  startedAt: number;
  render?: { path?: string | null; bytes?: Uint8Array | null; mediaType?: string; model?: string | null } | null;
  /**
   * תמונות שלבים שכבר הועלו — מסלול היצירה: שירות הרנדר כותב אותן ישירות
   * ל-storage דרך כתובות חתומות, ומוסר את הנתיבים. במסלול הזה אין כאן בייטים
   * בכלל. מסלול הבק־אופיס עדיין שולח base64 ב-debug ומעלה למטה.
   */
  stagePaths?: RunStagePaths | null;
  /** התגובה הגולמית מה-vectorizer (מצב debug). null כשהצינור בכלל לא רץ (שגיאה מוקדמת). */
  vectorizer?: VectorizerPayload | null;
  error?: string | null;
}

/** מוריד את ה-SVG של כל מועמד ומשאיר את המדדים. אותו קילוף שהרשימה עשתה
 *  בקריאה — עכשיו בכתיבה, כך שאין מה לשלוף מלכתחילה. */
function slimCandidates(debug: Record<string, unknown>): unknown {
  if (!Array.isArray(debug.candidates)) return debug;
  const candidates = (debug.candidates as Array<Record<string, unknown>>).map((c) => {
    const { metal_svg, cutouts_svg, ...rest } = c;
    return { ...rest, has_svg: Boolean(metal_svg || cutouts_svg) };
  });
  return { ...debug, candidates };
}

/** שומר הרצה ליומן. מחזיר תמיד — נכשל בשקט אם ה-storage/DB לא זמינים. */
export async function persistRun(input: PersistRunInput): Promise<void> {
  try {
    const { id, vectorizer } = input;

    // 1) ההדמיה: אם כבר הועלתה (מסלול studio) נשתמש בנתיב; אחרת נעלה עכשיו.
    let renderPath = input.render?.path ?? null;
    if (!renderPath && input.render?.bytes) {
      renderPath = `runs/${id}/render.png`;
      await uploadFile(renderPath, input.render.bytes, input.render.mediaType ?? "image/png");
    }

    // 2) תמונות שלבי הביניים. אם הן כבר ב-storage (מסלול היצירה) לוקחים את
    // הנתיבים כמו שהם; אחרת מעלים כאן מה-base64 שב-debug.
    const stagePaths: RunStagePaths = { ...(input.stagePaths ?? {}) };
    const images = vectorizer?.debug?.images ?? {};
    for (const key of STAGE_KEYS) {
      const b64 = images[key];
      if (!b64) continue;
      try {
        const path = `runs/${id}/${key}.png`;
        await uploadFile(path, b64ToBytes(b64), "image/png");
        stagePaths[key] = path;
      } catch {
        // דילוג על שלב בודד שנכשל בהעלאה — לא מפיל את שאר השמירה.
      }
    }

    // 3) מסירים את ה-base64 הכבד מה-debug, ומפצלים: debug נשאר קל ומכיל את מה
    // שהרשימה מציגה, ו-debug_full מחזיק את ה-SVG של כל מועמד ונקרא רק בפתיחת
    // הרצה. בלי הפיצול הרשימה קוראת 80 שורות x עד 13 מועמדים x 2 SVG בשאילתה
    // אחת, וחוטפת statement timeout.
    let debug: unknown = null;
    let debugFull: unknown = null;
    if (vectorizer?.debug) {
      const { images: _drop, ...rest } = vectorizer.debug;
      void _drop;
      debugFull = rest;
      debug = slimCandidates(rest);
    }

    const m = vectorizer?.metrics;
    const metrics: RunMetrics | null = m
      ? {
          iou: m.iou,
          holes: m.vector_holes,
          meanDeviationMm: m.mean_contour_deviation_mm,
          maxDeviationMm: m.max_contour_deviation_mm,
        }
      : null;

    const status = input.error
      ? "error"
      : vectorizer?.status === "approved"
        ? "approved"
        : "rejected";

    await insertRun({
      id,
      source: input.source,
      design_id: input.designId ?? null,
      product_type: input.productType ?? null,
      prompt: input.prompt ?? null,
      color_key: input.colorKey ?? null,
      status,
      error: input.error ?? null,
      duration_ms: Date.now() - input.startedAt,
      render_model: input.render?.model ?? null,
      render_path: renderPath,
      stage_paths: stagePaths,
      svg: vectorizer?.cutouts_svg ?? null,
      metrics,
      debug,
      debug_full: debugFull,
    });
  } catch (e) {
    // יומן הוא best-effort — לא מפילים את בקשת המשתמש בגלל כשל שמירה.
    const message = (e as Error).message;
    console.error("persistRun failed:", message);

    // אבל שקט הוא לא best-effort, הוא אובדן: שורה שלא נכתבה נראית ביומן בדיוק
    // כמו הרצה שלא קרתה. מנסים שוב בלי מה שכנראה הפיל את הכתיבה — התמונות,
    // ה-SVG וה-debug — כדי שלפחות יישאר סימן שהניסיון היה, ולמה הוא חסר.
    try {
      await insertRun({
        id: input.id,
        source: input.source,
        design_id: input.designId ?? null,
        product_type: input.productType ?? null,
        prompt: input.prompt ?? null,
        color_key: input.colorKey ?? null,
        status: "error",
        error: input.error ?? `run happened, log write failed: ${message}`,
        duration_ms: Date.now() - input.startedAt,
        stage_paths: {},
      });
    } catch (e2) {
      console.error("persistRun minimal fallback failed:", (e2 as Error).message);
    }
  }
}
