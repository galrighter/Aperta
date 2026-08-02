import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import { getDesign, getVersion, countTodayGenerations } from "@/lib/db/designs";
import { requireDesignAccess } from "@/lib/designAccess";
import { requireAdmin } from "@/lib/admin";
import { decodeDataUrl, signedUrl } from "@/lib/db/storage";
import { buildRenderPrompt, LETTERING_MODEL } from "@/lib/llm/imagegen";
import { LlmError, type LlmImage } from "@/lib/llm/core";
import { ingestCutouts, designDims } from "@/lib/vectorizer";
import { planRender } from "@/lib/render/panels";
import { canvasFor, sizeParam } from "@/lib/render/canvas";
import { buildBaseRenderSvg } from "@/lib/render/baseImage";
import { buildLetteringRenderSvg } from "@/lib/render/letteringImage";
import { runRenderJob } from "@/lib/render/service";
import { frameCandidates } from "@/lib/render/frameClient";
import { persistRun, type PersistRunInput } from "@/lib/runs/persist";
import { createJob, failJob, finishJob, setJobStage } from "@/lib/db/jobs";
import { getAccount } from "@/lib/db/accounts";
import { designCode } from "@/lib/designCode";
import { sendMail, mailConfigured } from "@/lib/mail";
import { isQuotaFailure, alertQuotaExhausted } from "@/lib/alerts/quota";
import { designReadyMail } from "@/lib/mailTemplates";
import { SITE } from "@/lib/site.config";
import type { DesignRow } from "@/lib/db/designs";
import type { CheckResult } from "@/lib/geometry/types";
import { he } from "@/i18n/he";

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
  /**
   * הכיתוב שהלקוחה ביקשה על התכשיט. הוא **אינו** נכנס לפרומפט אלא נחתך
   * אצלנו מהפונט ונמסר למודל כתמונת ייחוס (lib/render/letteringImage.ts):
   * כשהוא כותב לפי מילים הוא בולע אותיות ומתקן כתיב, וכשיש לו מה להעתיק הוא
   * מדייק ברוב החלופות. ברוב, לא בכולן — הלקוחה בוחרת ומאשרת.
   */
  text: z.string().max(40).optional(),
  currentSvg: z.string().max(500_000).nullable().optional(),
  /** הגרסה ש-`currentSvg` נלקח ממנה — ליומן בלבד, כדי שיהיה אפשר להעמיד את
   *  הפרומפט מול מה שהמודל באמת ראה. הלקוחה יכולה לערוך גרסה ישנה, ולכן זו
   *  לא בהכרח הגרסה הנוכחית של העיצוב. */
  baseVersionId: z.string().uuid().optional(),
  images: z.array(imageSchema).max(3).default([]),

  // --- כיול פרומפט (בק־אופיס בלבד; ראה את השער ב-POST) ---
  /** הפרומפט המדויק שיישלח למודל, במקום זה שנבנה מהמידות. */
  promptOverride: z.string().max(8000).optional(),
  /** כמה פריטים בתמונה, במקום מה ש-planRender גוזר מהיחס. */
  rowsOverride: z.number().int().min(1).max(40).optional(),
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
    // כיול הפרומפט רץ על **אותו מסלול** כמו הלקוחה — זו כל הנקודה: הבדל אחד
    // מכוון ולא צינור שני שנשאר תואם בזכות משמעת. אבל טקסט חופשי שנשלח ישירות
    // למודל התמונה עם המפתח שלנו הוא, בלי שער, כרטיס אשראי פתוח לכל אחד.
    if (body.promptOverride || body.rowsOverride) requireAdmin(req);

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
      // מי שסגרה את החלון באמצע היצירה לא ידעה שהעיצוב מוכן. `design` נקרא
      // *לפני* ההרצה, ולכן `current_version_id` שלו הוא המצב שקדם לה — וזה מה
      // שמבדיל יצירה ראשונה מעריכה.
      await notifyDesignReady(design);
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

/**
 * מייל "העיצוב שלך מוכן" — על הגרסה הראשונה של עיצוב בלבד.
 *
 * שלושה תנאים, וכולם אותו כלל: להתריע רק כשיש למי ועל מה. עיצוב שכבר הייתה
 * לו גרסה הוא עריכה; פרופיל בודק הוא הסטודיו הפנימי; ובלי מייל אין נמען.
 *
 * **לעולם לא מפיל את הבקשה.** היצירה הצליחה ונשמרה; מה שיכול להיכשל כאן הוא
 * ההתראה בלבד, והכיוון ההפוך היה מציג "היצירה נכשלה" על עיצוב שקיים.
 */
async function notifyDesignReady(design: DesignRow): Promise<void> {
  try {
    if (design.current_version_id) return;
    if (!mailConfigured()) return;
    const owner = await getAccount(design.profile_id);
    if (!owner?.email || owner.kind === "tester") return;
    const mail = designReadyMail({
      name: owner.name,
      code: designCode(design.serial),
      url: `${SITE.url}/design?resume=${design.id}`,
    });
    const res = await sendMail({ to: owner.email, subject: mail.subject, text: mail.text });
    if (!res.ok) console.error("design-ready mail failed:", res.error);
  } catch (e) {
    console.error("design-ready mail failed:", (e as Error).message);
  }
}

function toJobError(err: unknown) {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  if (err instanceof LlmError) return { code: "llm_error", message: err.message };
  return { code: "internal", message: err instanceof Error ? err.message : String(err) };
}

/**
 * ההתראה על גשר צר.
 *
 * הגשר שמחזיק את החלל הסגור של אות נגזר מגובה החלל (lib/text/stencil.ts), כי
 * גשר ברוחב המינימום לייצור בולע חלל של `e` בגובה 6 מ"מ במקום לגשר אותו. מה
 * שנחתך שם דק מכפי שהמינימום מבטיח, ולכן זו לא החלטה שאפשר לקבל בשקט בשם
 * הלקוחה: היא רואה שהפריט דורש בדיקה הנדסית, עם המספרים.
 *
 * אזהרה ולא כשל: הפריט ניתן לייצור, השאלה היא באיזו רזרבה — וזו שאלה שנפתרת
 * בבדיקה, לא בסירוב.
 */
function letteringBridgeCheck(tightShare: number | null): CheckResult[] {
  if (tightShare === null) return [];
  const pct = Math.round(tightShare * 100);
  const min = FAB.minLetterBridgeMm;
  return [{
    check: "LETTERING_BRIDGE",
    status: "warn",
    message: `${he.checks.LETTERING_BRIDGE} (${pct}% מהחלל)`,
    details:
      `A letter counter is too small to hold a proportional bridge, so the bridge stays at the ` +
      `${min}mm letter minimum and takes ${pct}% of the counter. Manufacturable; what needs ` +
      "confirming is whether the lettering still looks right.",
    locations: [],
  }];
}

type GenerateBody = Awaited<ReturnType<typeof parseBody<typeof schema>>>;

/** העבודה עצמה. זורק ApiError/LlmError; הקורא כותב את התוצאה ל-job. */
async function runGeneration(body: GenerateBody, runId: string, jobId: string) {
  const startedAt = Date.now();
  let persisted = false;
  let designId: string | null = null;
  let userPrompt: string | null = null;
  /** הרפרנס האנושי לעיצוב. נשמר בחוץ כי ההתראה על כשל נשלחת מה-catch. */
  let designRef: string | null = null;
  /** מה שנשלח למודל ומה שקבע אותו — נשמר ליומן גם כשההרצה נכשלה. */
  let runLog: Pick<PersistRunInput, "renderPrompt" | "inputs" | "inputImage"> | null = null;

  try {
    designId = body.designId;
    userPrompt = body.userPrompt;
    const design = await getDesign(body.designId);
    designRef = designCode(design.serial);

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
    //
    // עריכה (currentSvg קיים): הפריט הקיים נמסר למודל כתמונה, ולכן הפרומפט
    // מדבר על התמונה המצורפת ולא מתאר פריט חדש. **התכנון זהה** ליצירה מאפס:
    // רפרנס ושורות דוחפים לאותו יחס, לא זה נגד זה, ואין סיבה לוותר על אחד מהם.
    // עד 30.7 עריכה קיבלה שורה אחת בארבע קריאות — נימוק שלא נמדד מעולם, ופי
    // ארבעה בעלות מול הצינור החדש (~$0.006 להרצה).
    const fab = resolveFab(dims.thicknessMm, design.product_type);
    const minHoleMm = fab.minHole;
    const editSvg = buildBaseRenderSvg(body.currentSvg);
    // מספר הגרסה שנמסרה כבסיס. שאילתה נוספת אחת לכל עריכה, ורק כדי שהיומן
    // יידע *על מה* השינוי נשלח. שדה יומן לא מפיל הרצה: כשל כאן משאיר אותו ריק.
    const baseVersionNo = editSvg && body.baseVersionId
      ? await getVersion(body.baseVersionId)
          .then((v) => (v.design_id === design.id ? v.version_no : undefined))
          .catch(() => undefined)
      : undefined;
    // עקיפת הכיול נוגעת בשורות בלבד; העמודות נשארות 1 כדי שהניסוי יהיה על
    // משתנה אחד — ומספר החלופות שווה למספר השורות, כמו לפני שהיו עמודות.
    // צורת הקנבס נגזרת מהאורך, לא מהעדפה: בפס שבו הפריט קצר מכדי לבקש שורות
    // בקנבס לרוחב וארוך מכדי לקבל עמודה שנייה, קנבס לאורך הוא הידית היחידה.
    // המתג כבוי כברירת מחדל עד שהקופסה נפרסת — ראו lib/render/canvas.ts.
    const canvas = canvasFor(dims.lengthMm);
    const plan = body.rowsOverride
      ? { rows: body.rowsOverride, cols: 1, calls: 1 as const, candidates: body.rowsOverride, canvas }
      : planRender({ ratio: dims.lengthMm / dims.widthMm, widthMm: dims.widthMm, minHoleMm, canvas });

    // הכיתוב נחתך אצלנו ונמסר כתמונת ייחוס — **רק ביצירה מאפס**. בעריכה
    // תמונת הייחוס היא כבר העיצוב הקיים, והכיתוב יושב בתוכו; שתי תמונות אין
    // לאן לשלוח, ועדיף לשמר את מה שעל המסך.
    const lettering = editSvg || !body.text?.trim()
      ? null
      : await buildLetteringRenderSvg(
          body.text, dims, design.product_type, plan.rows, body.userPrompt, plan.cols, canvas,
        );
    if (!editSvg && body.text?.trim() && !lettering) {
      throw new ApiError(
        "text_too_long",
        `הכיתוב "${body.text.trim()}" ארוך מדי לפריט בגודל הזה — נסו טקסט קצר יותר.`,
        400,
      );
    }
    const baseSvg = editSvg ?? lettering?.svg ?? null;
    // למודל התמונה יש מקום לתמונת ייחוס אחת (`_reference` בקופסה בוחר את
    // base_svg על פני ההשראה). כשיש כיתוב הוא זה שנוסע — הוא ההבטחה הקשיחה
    // ללקוחה, וההשראה היא רוח שאפשר לתאר במילים. נאפס אותה כאן ולא נשאיר
    // ליומן דיווח על תמונה שלא נשלחה.
    if (lettering) inspiration = null;
    // הפרומפט מהבק־אופיס נשלח **כמו שהוא**. שים לב שמשפט ה-LAYOUT יושב בתוכו,
    // ומספר השורות שחותך בפועל הוא `plan.rows` — אם הם סותרים, הקופסה תחתוך
    // לפי plan.rows. זה מכוון (אפשר לנסות ניסוח מול חיתוך אחר), והמסך מציג את
    // המספר שיחתוך ליד התיבה כדי שהסתירה תהיה גלויה.
    const prompt =
      body.promptOverride?.trim() ||
      buildRenderPrompt(
        body.userPrompt, design.product_type, dims, plan.rows,
        Boolean(editSvg), Boolean(lettering), plan.cols,
      );

    // מה שהיומן צריך כדי להסביר את התוצאה: הפרומפט שיצא בפועל, והמאפיינים
    // שבנו אותו. הוא נבנה כאן ולא בתוך persistRun כדי ששתי הקריאות — ההצלחה
    // והכשל שבתפיסה למטה — ידווחו בדיוק את אותו דבר.
    runLog = {
      renderPrompt: prompt,
      inputs: {
        productType: design.product_type,
        lengthMm: dims.lengthMm,
        widthMm: dims.widthMm,
        thicknessMm: dims.thicknessMm,
        rows: plan.rows,
        cols: plan.cols,
        calls: plan.calls,
        /** צורת הקנבס שנשלחה בפועל. בלי זה אי אפשר להעמיד ביומן הרצה בפס
         *  מול הרצה מחוצה לו — ושתיהן נראות זהות בכל שדה אחר. */
        canvasSize: sizeParam(canvas),
        minHoleMm,
        colorKey: "dark",
        imageCount: body.images.length,
        // האם ההרצה יצאה מהעיצוב הקיים או מאפס. בלי זה אי אפשר להבחין ביומן
        // בין עריכה שלא שימרה את הבסיס לבין יצירה חדשה שכך התבקשה.
        editedFromCurrent: Boolean(editSvg),
        editedFromVersion: baseVersionNo,
        /** הכיתוב שנחתך, והטיפוגרפיה שכל שורה קיבלה. בלי זה אי אפשר להסביר
         *  ביומן למה חלופה אחת נראית אחרת מהשנייה.
         *
         *  השדות נבחרים אחד-אחד ולא נשפכים: `LetteringRow` נושאת גם את
         *  הפוליגונים של האותיות, וזו גאומטריה במשקל של עשרות קילובייט
         *  לשורה. שורת יומן היא דיווח, לא עותק. */
        lettering: lettering
          ? {
              text: body.text?.trim(),
              rows: lettering.rows.map((r) => ({
                fontId: r.fontId,
                letterHeightMm: r.letterHeightMm,
                textWidthMm: r.textWidthMm,
              })),
            }
          : null,
        /** ההרצה הגיעה ממסך הכיול עם פרומפט שנכתב ידנית. */
        promptOverride: Boolean(body.promptOverride?.trim()),
      },
      inputImage: inspiration
        ? { bytes: decodeDataUrl(`data:${inspiration.mediaType};base64,${inspiration.base64}`).bytes,
            mediaType: inspiration.mediaType }
        : null,
    };

    // 2) הנתיבים שהקופסה תכתוב אליהם. אנחנו חותמים כתובת העלאה לכל אחד; הבייטים
    // עצמם לא עוברים כאן. "coverage" קורא את צבע הרקע משולי התמונה ואת צבע המתכת
    // מהפיקסלים הרחוקים ממנו, ולכן הוא לא תלוי בכך שהמודל ציית לפרומפט — מה
    // שנכשל בפועל, ובעקבותיו החזרנו הדמיה מוצללת שסף גלובלי יחיד עיגל למתכת.
    const stamp = Date.now();
    const job = await runRenderJob({
      prompt,
      calls: plan.calls,
      rows: plan.rows,
      size: sizeParam(canvas),
      cols: plan.cols,
      heightMm: dims.widthMm,
      colorKey: "coverage",
      // הפתח המינימלי נגזר כאן ונשלח כמספר: חוקי הייצור נשארים במקום אחד, והקופסה
      // מיישמת אותם. בלי זה שערה של 0.17 מ"מ שהטרייסר משאיר לצד עלה נכנסת ל-SVG
      // ופוסלת את כל הפס ב-V5 — פתח שאי אפשר לחתוך ממילא.
      minHoleMm,
      inspiration,
      baseSvg,
      // הרצה עם כיתוב רצה על מודל אחר — ראה LETTERING_MODEL. שאר ההרצות
      // נשארות על ברירת המחדל הזולה.
      model: lettering ? LETTERING_MODEL : undefined,
      renderPaths: Array.from({ length: plan.calls }, (_, i) => `renders/${design.id}/${stamp}-${i}.png`),
      stagePaths: {
        // מה שהמודל באמת ראה. בלי זה אפשר רק לשחזר אותו מהקוד, וזו טענה אחרת.
        reference: `runs/${runId}/reference.png`,
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
      colorKey: "coverage",
      startedAt,
      render: { path: renderPngPath, model: job.model },
      stagePaths: job.stagePaths,
      vectorizer: job.raw,
      ...runLog,
      inputs: {
        ...runLog.inputs,
        // נכתב כאן ולא למעלה: המספר השני ידוע רק אחרי שהקופסה ענתה. פער בין
        // השניים אומר שהמודל לא צייר את הרשת שהתבקשה.
        plannedCandidates: plan.candidates,
        deliveredPanels: job.candidates.length,
      },
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
    // הכיתוב **אינו** נדרס אחרי שהמודל מחזיר. היה כאן שלב שהחליף את מה
    // שהמודל צייר בנתיבי הפונט המקוריים, והוא הוסר (החלטת גל, 31/07): המודל
    // מדויק ב-3 מתוך 4 חלופות, הלקוחה בוחרת ומאשרת בעצמה, והעיצוב שהיא
    // רואה הוא זה שנחתך — בלי שכבה שמדביקה אותיות על גביו. המחיר מוצג לה
    // במפורש בשדה הכיתוב (`textVerify`): לוודא את האיות לפני הזמנה.
    // המדידות ששני הכיוונים נשענים עליהן: docs/research/HEBREW_TEXT_LETTERING_FIELD.md §6.8.
    const bridgePlan = { letterBridges: lettering?.rows.flatMap((r) => r.bridges) };
    const candidates = (await frameCandidates(designDims(design), approved.map((c) => c.cutoutsSvg!), bridgePlan))
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
    // ההצעות נשמרות על הגרסה עצמה (0012). עד כאן הן חזרו בגוף התשובה בלבד,
    // כלומר חיו רק בזיכרון הדפדפן ונמחקו בכל רענון.
    const offeredRows = offered.map((c) => ({
      svg: c.framedSvg,
      report: c.report,
      drawnRatio: Math.round(c.drawnRatio * 100) / 100,
      stretch: Math.round(c.stretch * 1000) / 1000,
    }));
    const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
      design,
      cutoutsSvg: candidates[0].framedSvg,
      userPrompt: body.userPrompt,
      renderPngPath,
      metrics,
      candidates: offeredRows,
      generationId: runId,
      // הגשרים של הכיתוב נחתכים מהפונט אצלנו, לפני שהמודל צייר משהו, ולכן הם
      // אינם נגזרים מה-SVG שהוולידציה בודקת. בלי זה הלקוחה מקבלת פריט שדורש
      // בדיקה בלי לדעת על כך.
      extraChecks: letteringBridgeCheck(lettering?.tightShare ?? null),
      // הגשרים שחתכנו בכיתוב. אם המודל לא צייר אותם, המסגור מחזיר אותם
      // למקומם במקום למחוק את החלל — ראה geometry/restoreBridges.
      bridgePlan,
      // candidates ממוין כך שהזוכה ראשון, ו-offered שומר על הסדר — הגרסה
      // שנשמרת כאן היא ההצעה הראשונה, אלא אם היא נפלה בוולידציה ואינה מוצעת.
      pickedIndex: offeredRows.length > 0 && offered[0] === candidates[0] ? 0 : null,
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
      candidates: offeredRows,
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
        colorKey: "coverage",
        startedAt,
        error: err instanceof Error ? err.message : String(err),
        vectorizer: null,
        ...(runLog ?? {}),
      });
    }
    // תקציב שנגמר אצל ספק התמונות משבית את היצירה לכולם עד שמישהו מוסיף תקציב,
    // ואי אפשר לגלות אותו מהאתר. ההתראה נשלחת אחרי כתיבת השורה ליומן, כדי
    // שהמייל והיומן יספרו את אותו סיפור — ולא מפילה את הכשל המקורי.
    if (isQuotaFailure(err)) {
      await alertQuotaExhausted(err, { runId, designRef, startedAt });
    }
    throw err;
  }
}
