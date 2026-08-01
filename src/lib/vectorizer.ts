import { ApiError } from "@/lib/api";
import {
  type DesignRow,
  type VersionRow,
  type VersionCandidate,
  insertVersion,
  replaceVersion,
} from "@/lib/db/designs";
import { frameCutoutsDims, type FramedCutouts, type FramedPreview } from "@/lib/geometry/frameCutouts";
import type { DesignDims } from "@/lib/geometry/validate";
import { difference, rectPolygon } from "@/lib/geometry/poly";
import type { CheckResult, CheckStatus, ValidationReport } from "@/lib/geometry/types";

/** דירוג החומרה, כדי שממצא שנוסף לא יוכל להוריד את סטטוס הדוח. */
const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 };

/**
 * מיזוג ממצאים שלא נגזרו מה-SVG לתוך הדוח שלו.
 *
 * הסטטוס הכולל נלקח מהחמור מבין השניים: אזהרה על הכיתוב לא הופכת דוח שנכשל
 * לעובר, ודוח עובר עם אזהרה כזו הוא "עובר עם הערה" — וזה מה שהלקוחה רואה.
 */
function withExtraChecks(report: ValidationReport, extra?: CheckResult[] | null): ValidationReport {
  if (!extra?.length) return report;
  const status = [report.status, ...extra.map((c) => c.status)].reduce((a, b) =>
    RANK[a] >= RANK[b] ? a : b,
  );
  return { ...report, status, checks: [...report.checks, ...extra] };
}

// לקוח לשירות ה-vectorizer (רץ על Hetzner). מקבל תמונת רנדר ומחזיר cutouts SVG
// נקי ומוחלק. משותף ל-/api/vectorize (העלאה ידנית) ול-/api/generate (מסלול ה-AI).

export interface VectorizeResult {
  cutoutsSvg: string;
  widthMm: number;
  metrics: { iou?: number; holes?: number; meanDeviationMm?: number; maxDeviationMm?: number };
}

export interface VectorizeFull {
  status: string; // "approved" | "rejected" | ...
  cutoutsSvg: string | null;
  widthMm: number;
  metrics: VectorizeResult["metrics"];
  /** התגובה הגולמית מה-vectorizer (כולל debug) — נשמרת ליומן הבק־אופיס. */
  raw: Record<string, unknown>;
}

function vectorizerUrl(): string {
  return process.env.VECTORIZER_URL || "https://vec.rmjewel.com";
}

/** בקשת POST אחת ל-vectorizer. מחזיר את הגוף הגולמי או זורק על כשל תקשורת/תגובה לא־JSON. */
async function postJob(
  bytes: Uint8Array,
  mediaType: string,
  opts: { heightMm: number; colorKey: string; minHoleMm: number; debug: boolean },
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("image", new Blob([bytes as BlobPart], { type: mediaType }), "design.png");
  form.append("height_mm", String(opts.heightMm));
  form.append("condition", "true");
  form.append("color_key", opts.colorKey);
  // הפתח המינימלי נשלח כמספר; חוקי הייצור נשארים כאן. פתח שהלייזר לא יכול לפתוח
  // מושמט בקופסה לפני שהוא מגיע ל-SVG, במקום לפסול את הפס כולו ב-V5.
  form.append("min_hole_mm", String(opts.minHoleMm));
  if (opts.debug) form.append("debug", "true");

  const headers: Record<string, string> = {};
  if (process.env.VECTORIZER_TOKEN) headers.Authorization = `Bearer ${process.env.VECTORIZER_TOKEN}`;

  let resp: Response;
  try {
    resp = await fetch(`${vectorizerUrl()}/api/jobs`, { method: "POST", body: form, headers });
  } catch (e) {
    throw new ApiError("vectorizer_unreachable", `Could not reach vectorizer: ${(e as Error).message}`, 502);
  }
  const text = await resp.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ApiError(
      "vectorize_bad_response",
      `Vectorizer returned non-JSON (${resp.status} ${resp.headers.get("content-type")}): ${text.slice(0, 300)}`,
      502,
    );
  }
}

interface VectorizerJson {
  status?: string;
  error_code?: string;
  cutouts_svg?: string;
  input?: { width_mm?: number };
  metrics?: {
    iou?: number;
    vector_holes?: number;
    mean_contour_deviation_mm?: number;
    max_contour_deviation_mm?: number;
  };
}

function extractMetrics(d: VectorizerJson): VectorizeResult["metrics"] {
  return {
    iou: d.metrics?.iou,
    holes: d.metrics?.vector_holes,
    meanDeviationMm: d.metrics?.mean_contour_deviation_mm,
    maxDeviationMm: d.metrics?.max_contour_deviation_mm,
  };
}

/**
 * מריץ את ה-vectorizer במצב debug ומחזיר גם את התוצאה וגם את ה-payload הגולמי,
 * בלי לזרוק על דחיית נאמנות (כדי שאפשר לשמור את ההרצה ביומן ואז להחליט).
 */
export async function vectorizeImageFull(
  bytes: Uint8Array,
  mediaType: string,
  opts: { heightMm: number; colorKey: "coverage" | "warm" | "dark" | "saturation" | "auto"; minHoleMm: number },
): Promise<VectorizeFull> {
  const raw = await postJob(bytes, mediaType, { heightMm: opts.heightMm, colorKey: opts.colorKey, minHoleMm: opts.minHoleMm, debug: true });
  const d = raw as VectorizerJson;
  return {
    status: d.status || d.error_code || "unknown",
    cutoutsSvg: d.cutouts_svg ?? null,
    widthMm: Number(d.input?.width_mm ?? 0),
    metrics: extractMetrics(d),
    raw,
  };
}

/** גרסה זורקת: מחזיר את התוצאה אם אושרה, אחרת ApiError. עוטף את vectorizeImageFull. */
export async function vectorizeImage(
  bytes: Uint8Array,
  mediaType: string,
  opts: { heightMm: number; colorKey: "coverage" | "warm" | "dark" | "saturation" | "auto"; minHoleMm: number },
): Promise<VectorizeResult> {
  const full = await vectorizeImageFull(bytes, mediaType, opts);
  if (full.status !== "approved" || !full.cutoutsSvg) {
    throw new ApiError("vectorize_failed", `Vectorizer did not approve: ${full.status}`, 422);
  }
  return { cutoutsSvg: full.cutoutsSvg, widthMm: full.widthMm, metrics: full.metrics };
}


export interface IngestResult {
  version: VersionRow;
  report: ValidationReport;
  geometry: { material: ReturnType<typeof difference>; cutUnion: unknown } | null;
  lengthMm: number;
  widthMm: number;
}


export type { FramedCutouts, FramedPreview };

/** המידות שהמסגור צריך מתוך שורת העיצוב. `width_mm` הוא הרוחב שהוזמן. */
export function designDims(design: DesignRow): DesignDims {
  return {
    productType: design.product_type,
    lengthMm: Number(design.length_mm),
    widthMm: Number(design.width_mm),
    thicknessMm: Number(design.thickness_mm),
  };
}

/** מסגור מועמד מול שורת עיצוב. החישוב עצמו ב-geometry/frameCutouts. */
export function frameCutouts(design: DesignRow, cutoutsSvg: string): FramedCutouts {
  return frameCutoutsDims(designDims(design), cutoutsSvg);
}

/**
 * מריץ cutouts SVG שהתקבל מה-vectorizer דרך מנוע הוולידציה ושומר גרסה.
 * משותף למסלול ההעלאה ולמסלול ה-AI.
 *
 * האורך שהלקוחה הזמינה הוא מדידה ולא הצעה: הוא נקבע מהיקף היד/האצבע, ופריט
 * באורך אחר פשוט לא נסגר. לכן הדוגמה נמתחת אל האורך שהוזמן במקום שהאורך יוסט
 * אל מה שמודל התמונה צייר (שקודם נכתב על השדה — ומחק את מה שהוזמן).
 *
 * המתיחה מתחלקת בין שני הצירים: עד 5% מהפער נבלעים ברוחב, ושם זו הגדלה אחידה
 * שאינה מעוותת את הדוגמה כלל; רק מה שנשאר מעבר לזה נמתח אופקית. הוולידציה רצה
 * על המסגרת הסופית, כך שאם המתיחה שברה מינימום ייצור — הגרסה נדחית.
 *
 * renderPngPath (אם קיים) נשמר בתוך דוח הוולידציה כדי להציג את ההדמיה בלי שינוי סכימה.
 */
export async function ingestCutouts(opts: {
  design: DesignRow;
  cutoutsSvg: string;
  userPrompt: string | null;
  renderPngPath: string | null;
  metrics?: VectorizeResult["metrics"];
  /** 0012 — ההצעות שהוצעו יחד עם הגרסה, ומאיזו הרצה/הצעה היא באה. */
  candidates?: VersionCandidate[] | null;
  generationId?: string | null;
  pickedIndex?: number | null;
  /**
   * ממצאים שנקבעו לפני שהגאומטריה חזרה — כרגע הגשרים של הכיתוב, שנחתכים
   * מהפונט אצלנו ולכן אינם נגזרים מה-SVG שהוולידציה בודקת. הם נכנסים לאותו
   * דוח כדי שהלקוחה תראה אותם באותו מקום שבה היא רואה כל ממצא אחר.
   */
  extraChecks?: CheckResult[] | null;
  /**
   * דריסת שורה קיימת במקום הוספה. משמש **רק** מעבר בין ההצעות של אותה הרצה,
   * שהוא ניווט ולא שינוי — ראו `lib/versionRole`. כל שאר המסלולים מוסיפים.
   */
  replaceVersionId?: string | null;
}): Promise<IngestResult> {
  const { design, cutoutsSvg } = opts;
  const framed = frameCutouts(design, cutoutsSvg);
  const { lengthMm, widthMm, framedSvg, normalized } = framed;
  const report = withExtraChecks(framed.report, opts.extraChecks);

  const svg = normalized?.canonicalSvg ?? framedSvg;
  // שומרים נתיב הדמיה + מדדי vectorizer בתוך הדוח (jsonb) — בלי מיגרציה. משמש ליומן הבק־אופיס.
  const validation_report = {
    ...report,
    renderPngPath: opts.renderPngPath,
    vectorizer: opts.metrics ?? null,
  };

  const version = opts.replaceVersionId
    ? await replaceVersion(opts.replaceVersionId, {
        svg,
        validation_report,
        validation_status: report.status,
        ...(opts.pickedIndex !== undefined ? { picked_index: opts.pickedIndex } : {}),
      })
    : await insertVersion({
        design_id: design.id,
        svg,
        source: "generate",
        user_prompt: opts.userPrompt,
        annotation_png_path: null,
        validation_report,
        validation_status: report.status,
        ...(opts.candidates !== undefined ? { candidates: opts.candidates } : {}),
        ...(opts.generationId !== undefined ? { generation_id: opts.generationId } : {}),
        ...(opts.pickedIndex !== undefined ? { picked_index: opts.pickedIndex } : {}),
      });

  const geometry = normalized
    ? {
        material: difference([rectPolygon(0, 0, lengthMm, widthMm)], normalized.cutUnion),
        cutUnion: normalized.cutUnion,
      }
    : null;

  return { version, report, geometry, lengthMm, widthMm };
}
