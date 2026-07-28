import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import { getDesign, countTodayGenerations } from "@/lib/db/designs";
import { requireDesignAccess } from "@/lib/designAccess";
import { decodeDataUrl, signedUrl } from "@/lib/db/storage";
import { buildRenderPrompt } from "@/lib/llm/imagegen";
import { LlmError, type LlmImage } from "@/lib/llm/core";
import { ingestCutouts, designDims } from "@/lib/vectorizer";
import { CANDIDATE_TARGET, planRender } from "@/lib/render/panels";
import { runRenderJob } from "@/lib/render/service";
import { frameCandidates } from "@/lib/render/frameClient";
import { persistRun } from "@/lib/runs/persist";
import { createJob, failJob, finishJob, setJobStage } from "@/lib/db/jobs";

// יצירה במסלול ה-AI (מסלול 2): טקסט/השראה → מודל תמונה (רנדר של התכשיט) →
// קונדישנינג + vectorizer → cutouts SVG → צינור הוולידציה הקיים → גרסה.
//
// החצי הכבד של הצינור רץ על הקופסה (src/lib/render/service.ts): שם ההדמיות
// נוצרות, נחתכות לשורות, מומרות לווקטור ונכתבות ל-storage. כאן נשאר מה שדורש
// ידע על ייצור — התכנון, הפרומפט, הוולידציה והגרסה — ובמונחי משאבים זו כמעט
// כולה המתנה ל-I/O. זה ההבדל בין הרצה שנהרגת ב-1102 לבין תשובה.
//
// כל הרצה נשמרת ל-generation_runs (כולל דחייה/שגיאה) ליומן הבק־אופיס.
//
// העבודה רצה בתוך הבקשה. קודם היא הועברה ל-waitUntil וההחזרה הייתה 202 מיידי,
// כדי שניתוק לא יאבד הרצה שהצליחה — ובפרודקשן העבודה פשוט לא רצה: כל יצירה
// נתקעה על stage=rendering, לא נכתבה שום שורה ל-generation_runs, ואחרי שש דקות
// הלקוחה קיבלה job_stalled. אין שגיאה כי לא היה מי שיכתוב אותה. מדוד על שלוש
// הרצות (27.7, אחרי #61) מול הרצה ישירה של אותו צינור שהצליחה ב-20 שניות.
//
// מה שנשמר מ-#61: שורת generation_jobs עדיין נכתבת, והלקוחה מייצרת את המזהה
// מראש — כך שאחרי ניתוק אפשר למשוך את התוצאה מ-/api/generate/<jobId> במקום
// לגלות שהיא אבדה. מה שאבד: הרצה לא שורדת ניתוק שקוטע את הבקשה עצמה. הדרך
// לקבל את זה בחזרה היא שהקופסה תחזיק את ה-job (יש לה כבר חנות + /api/jobs/<id>)
// ושנמשוך ממנה — לא isolate שאמור לשרוד אחרי שהתשובה יצאה.

export const maxDuration = 300;

const imageSchema = z.object({
  kind: z.enum(["inspiration", "annotation"]),
  dataUrl: z.string().max(8_000_000),
});

const schema = z.object({
  designId: z.string().uuid(),
  /** מזהה ההרצה, מיוצר בלקוחה. מאפשר למשוך את התוצאה מ-/api/generate/<id>
   *  אחרי שהחיבור נקטע, בלי לחכות שהשרת יחזיר אותו. */
  jobId: z.string().uuid().optional(),
  userPrompt: z.string().min(1).max(4000),
  currentSvg: z.string().max(500_000).nullable().optional(),
  images: z.array(imageSchema).max(3).default([]),
});

const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request) {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  let pipelineStarted = false;
  let designId: string | null = null;
  let userPrompt: string | null = null;

  try {
    const body = await parseBody(req, schema);
    designId = body.designId;
    userPrompt = body.userPrompt;
    // האימותים שהלקוחה צריכה לדעת עליהם מיד — בעלות, עיצוב קיים, מכסה יומית,
    // תמונות תקינות — נשארים סינכרוניים. אין טעם להחזיר job שכבר ידוע שייכשל.
    //
    // הבעלות היא הראשונה שנבדקת, והיא היחידה שעולה כסף: יצירה היא הרצת מנוע,
    // והמכסה נספרת על הפרופיל של העיצוב. בלי הבדיקה הזו מזהה עיצוב של חבר היה
    // מספיק כדי לשרוף את המכסה שלו — ואת התקציב שלנו.
    const design = await requireDesignAccess(req, body.designId);
    const used = await countTodayGenerations(design.profile_id);
    if (used >= FAB.DAILY_GENERATION_LIMIT) {
      throw new ApiError("rate_limited", `Daily generation limit reached (${FAB.DAILY_GENERATION_LIMIT}/day)`, 429);
    }
    for (const img of body.images) {
      const { mediaType } = decodeDataUrl(img.dataUrl);
      if (!ALLOWED_MEDIA.has(mediaType)) {
        throw new ApiError("bad_image", `Unsupported image type ${mediaType}`, 400);
      }
    }

    // מזהה שהלקוחה מייצרת מראש, כדי שתוכל למשוך את השורה גם אם הבקשה נקטעה.
    const jobId = body.jobId ?? crypto.randomUUID();
    // שורת ה-job היא רישום, לא תנאי להרצה: אם הטבלה חסרה (חלון בין פריסה
    // למיגרציה) היצירה עדיין רצה.
    try {
      await createJob({ id: jobId, designId: design.id, runId });
    } catch (e) {
      console.error("job row unavailable, running without it:", (e as Error).message);
    }

    try {
      pipelineStarted = true;
      const payload = await runGeneration(body, runId, jobId);
      await finishJob(jobId, payload);
      return NextResponse.json(payload);
    } catch (err) {
      await failJob(jobId, toJobError(err));
      throw err;
    }
  } catch (err) {
    // דחייה לפני שהצינור התחיל — מכסה יומית, תמונה לא נתמכת, עיצוב לא קיים,
    // גוף בקשה פסול — לא השאירה עד עכשיו שום עקבה. המשתמש ראה שגיאה והיומן לא
    // ראה כלום, כך שהתלונה "יצרתי ואין את זה ביומן" לא הייתה ניתנת לאבחון.
    // אחרי שהצינור התחיל, runGeneration כבר כותב את השורה בעצמו.
    if (!pipelineStarted) {
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
    return handleRouteError(err);
  }
}

function toJobError(err: unknown) {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  if (err instanceof LlmError) return { code: "llm_error", message: err.message };
  return { code: "internal", message: err instanceof Error ? err.message : String(err) };
}

type GenerateBody = Awaited<ReturnType<typeof parseBody<typeof schema>>>;

/** העבודה עצמה. זורק ApiError/LlmError; הקורא כותב את התוצאה ל-job. */
async function runGeneration(body: GenerateBody, runId: string, jobId: string) {
  const startedAt = Date.now();
  let persisted = false;
  let designId: string | null = null;
  let userPrompt: string | null = null;

  try {
    designId = body.designId;
    userPrompt = body.userPrompt;
    const design = await getDesign(body.designId);

    // תמונת השראה (אם צורפה) משמשת רפרנס למודל התמונה. סוג המדיה כבר אומת ב-POST.
    let inspiration: LlmImage | null = null;
    for (const img of body.images) {
      const { mediaType } = decodeDataUrl(img.dataUrl);
      if (img.kind === "inspiration" && !inspiration) {
        inspiration = {
          mediaType: mediaType as LlmImage["mediaType"],
          base64: img.dataUrl.slice(img.dataUrl.indexOf(",") + 1),
        };
      }
    }

    // 1) התכנון. כמה הדמיות, ובאיזו פריסה, נגזר מהיחס שהוזמן: מודל התמונה לא
    // מצייר יחס שמבקשים ממנו אלא נמשך ליחס נוח לו, וצורת הקנבס היא מה שמזיז
    // אותו. כל שורה היא גם מועמד לבחירת הלקוחה. הנימוקים והמדידות:
    // src/lib/render/panels.ts.
    const dims = {
      lengthMm: Number(design.length_mm),
      widthMm: Number(design.width_mm),
      thicknessMm: Number(design.thickness_mm),
    };
    const plan = planRender(dims.lengthMm / dims.widthMm, CANDIDATE_TARGET);
    const prompt = buildRenderPrompt(body.userPrompt, design.product_type, dims, plan.rows);

    // 2) הנתיבים שהקופסה תכתוב אליהם. אנחנו חותמים כתובת העלאה לכל אחד; הבייטים
    // עצמם לא עוברים כאן. ההדמיה היא מתכת שחורה מט על לבן, ולכן המפתח הוא "dark"
    // (255 פחות גווני האפור) — הוא והפרומפט חייבים להשתנות יחד.
    const stamp = Date.now();
    const job = await runRenderJob({
      prompt,
      calls: plan.calls,
      rows: plan.rows,
      heightMm: dims.widthMm,
      colorKey: "dark",
      // הפתח המינימלי נגזר כאן ונשלח כמספר: חוקי הייצור נשארים במקום אחד, והקופסה
      // מיישמת אותם. בלי זה שערה של 0.17 מ"מ שהטרייסר משאיר לצד עלה נכנסת ל-SVG
      // ופוסלת את כל הפס ב-V5 — פתח שאי אפשר לחתוך ממילא.
      minHoleMm: resolveFab(dims.thicknessMm, design.product_type).minHole,
      inspiration,
      renderPaths: Array.from({ length: plan.calls }, (_, i) => `renders/${design.id}/${stamp}-${i}.png`),
      stagePaths: {
        conditioned: `runs/${runId}/conditioned.png`,
        overlay: `runs/${runId}/overlay.png`,
        difference: `runs/${runId}/difference.png`,
        rendered: `runs/${runId}/rendered.png`,
      },
    });
    const renderPngPath = job.renderPaths[0] ?? null;

    // 3) שומרים את ההרצה ליומן *לפני* שמחליטים — כך גם דחיות נשמרות לאבחון.
    await persistRun({
      id: runId,
      source: "studio",
      designId: design.id,
      productType: design.product_type,
      prompt: body.userPrompt,
      colorKey: "dark",
      startedAt,
      render: { path: renderPngPath, model: job.model },
      stagePaths: job.stagePaths,
      vectorizer: job.raw,
    });
    persisted = true;

    // הרנדר מאחורינו; מכאן זה מסגור, ולידציה ושמירה. הלקוחה רואה את המעבר.
    await setJobStage(jobId, "saving");

    // 4) מסגור כל מועמד למידה שהוזמנה, ודירוג: קודם מה שעובר ולידציה, ואז מי
    // שנמתח הכי פחות — כלומר מי שהמודל צייר הכי קרוב ליחס האמיתי.
    //
    // המסגור עצמו כבר לא רץ כאן אלא ב-Worker נפרד (src/lib/render/frameClient).
    // תקרת ה-128MB היא לכל isolate ומשותפת לכל הבקשות שרצות בו, ומסגור הוא
    // המקצה הגדול ביותר בבקשה — 45.1MB בתום הקריאה על ארבעה מועמדים אמיתיים
    // לפני שהפסקנו להחזיק את `normalized`, 16.5MB אחרי. ה-isolate הזה נהרג
    // על זיכרון בבקשה יחידה (reqs=1), ולכן מה שנשאר להוציא הוא המקצה עצמו,
    // לא ההחזקה שלו. מכאן ה-isolate של האתר ממסגר פעם אחת בלבד — את הזוכה,
    // בתוך ingestCutouts, שגוזר את הגאומטריה שלו ממילא מחדש.
    const RANK = { pass: 0, warn: 1, fail: 2 } as const;
    const approved = job.candidates.filter((c) => c.status === "approved" && c.cutoutsSvg);
    const candidates = (await frameCandidates(designDims(design), approved.map((c) => c.cutoutsSvg!)))
      .sort((a, b) => RANK[a.report.status] - RANK[b.report.status] || Math.abs(a.stretch - 1) - Math.abs(b.stretch - 1));

    if (candidates.length === 0) {
      const status = String((job.raw as { status?: string }).status ?? "no candidate");
      throw new ApiError("vectorize_failed", `Vectorizer did not approve any panel: ${status}`, 422);
    }

    // 5) הטוב ביותר נשמר כגרסה; השאר חוזרים לבחירת הלקוחה — אבל רק אלה שאפשר
    // לייצר. הצעה שנכשלה בוולידציה אינה בחירה אלא מלכודת: היא נראית ככל השאר,
    // הלקוחה תבחר בה כי היא יפה, והמסע ייעצר בייצוא. אם *כל* המועמדים נכשלו
    // הרשימה מתרוקנת והמסך מציג את הגרסה השמורה עם הסיבה שאי אפשר לייצר אותה.
    const offered = candidates.filter((c) => c.report.status !== "fail");
    const raw = (job.raw as { metrics?: Record<string, number> }).metrics;
    const metrics = {
      iou: raw?.iou,
      holes: raw?.vector_holes,
      meanDeviationMm: raw?.mean_contour_deviation_mm,
      maxDeviationMm: raw?.max_contour_deviation_mm,
    };
    const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
      design,
      cutoutsSvg: candidates[0].framedSvg,
      userPrompt: body.userPrompt,
      renderPngPath,
      metrics,
    });

    // ההדמיה חוזרת כקישור חתום ולא כ-data URL. ה-PNG שוקל ~2.3MB, כלומר ~3.1MB
    // בבסיס64 — פי עשרה משאר התשובה, ומסע היצירה של הלקוחה אפילו לא קורא אותו
    // (רק טאב הרנדר בסטודיו). תשובה כבדה על חיבור אטי נקטעת, וה-client מתרגם
    // גוף לא־תקין לשגיאה כללית — "היצירה נכשלה" על הרצה שהצליחה בשרת.
    const renderUrl = renderPngPath ? await signedUrl(renderPngPath, 3600).catch(() => null) : null;

    return {
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
      render: { model: job.model, url: renderUrl },
      vectorizer: metrics,
    };
  } catch (err) {
    // אם עוד לא שמרנו הרצה (כשל מוקדם — שירות הרנדר לא זמין, מודל התמונה) — נרשום שגיאה.
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
    throw err;
  }
}
