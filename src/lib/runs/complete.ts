import { collectRenderJob, runRenderJob, type RenderJob } from "@/lib/render/service";
import { frameCandidates } from "@/lib/render/frameClient";
import { ingestCutouts, designDims, type FramedPreview } from "@/lib/vectorizer";
import { MAX_CANDIDATES } from "@/lib/render/panels";
import { pickClosestRatio, ratioGap } from "@/lib/render/ratioGap";
import { persistRun, type PersistRunInput } from "@/lib/runs/persist";
import { createSampleDesign, getDesign, updateDesignWidth } from "@/lib/db/designs";
import { claimJobDone, hasNewerFinishedJob } from "@/lib/db/jobs";
import { STORY_RENDER, isStory, orderByVariety, storyFrameDims } from "@/lib/story/mode";
import { svgFrame } from "@/lib/geometry/frame";
import { notifyDesignReady } from "@/lib/designReadyNotice";
import { runImageUrl } from "@/lib/runs/imageUrl";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";
import { noteRunVerdicts, verdictOf, type RunSource, type RunStagePaths } from "@/lib/db/runs";
import type { LetterBridge } from "@/lib/geometry/restoreBridges";
import type { CheckResult } from "@/lib/geometry/types";

// סיום הרצה **בלי הבקשה שפתחה אותה**.
//
// זה הפער שהשאיר הרצות תקועות (docs/C2_RESILIENT_GENERATION.md §5): החצי היקר
// כבר שרד ניתוק — הקופסה מחזיקה את ההדמיה תחת מזהה — אבל הידיעה איך לסיים חיה
// רק בזיכרון של הבקשה. נהרגה הבקשה, והתוצאה ששולמה נשארה שם בלי שאיש ידע מה
// לעשות איתה, עד שהשורה הוכרזה תקועה.
//
// מכאן ההקשר יושב בשורה, ומי שמגיע אליה יכול לסיים: לאסוף מהקופסה, למסגר,
// לאמת, לשמור גרסה ולסגור. אותו קוד משרת את הבקשה המקורית ואת מי שמנקה אחריה.

/**
 * מה שנשמר בשורת ההרצה, ומספיק כדי לסיים אותה.
 *
 * **הכול קטן במכוון.** מספרים, מלבנים ומחרוזת התיאור. מה שגדול — ההדמיה
 * ותמונת ההשראה — אינו כאן אלא בקופסה ובאחסון, ומה שמצביע עליו הוא מזהה.
 * הגשרים נושאים תיבה וארבעה מספרים כל אחד ולא את צורות האותיות (אלה יושבות על
 * השורה של הכיתוב, שאינה נשמרת).
 */
export interface JobContext {
  /** המזהה שתחתיו הקופסה מחזיקה את ההרצה. אי אפשר לחשב אותו מחדש — הוא נגזר
   *  גם מתוכן הבקשה, ותמונת ההשראה כבר לא בידנו בגודלה. */
  boxJobId: string;
  /** מזהה הניסיון — שורת היומן, נתיבי ההדמיות, וקיבוץ הגרסאות נשענים עליו. */
  attemptId: string;
  /** העיצוב שההרצה שייכת לו. הבעלות עליו כבר נבדקה כשההרצה נפתחה. */
  designId: string;
  renderPaths: string[];
  stagePaths: RunStagePaths;
  /** התיאור של הלקוחה, כפי שנרשם ליומן ונשמר על הגרסה. */
  userPrompt: string;
  /** מה שנשלח למודל בפועל. */
  renderPrompt: string;
  /** שדות היומן שכבר נבנו בבקשה המקורית — נרשמים כמות שהם. */
  inputs: PersistRunInput["inputs"];
  /** הגשרים שנחתכו בכיתוב. ריק = הרצה בלי כיתוב. */
  bridges: LetterBridge[];
  /** חלקו של הגשר הצר ביותר מהחלל — האזהרה על טיפוגרפיה. */
  tightShare: number | null;
  /** מתי ההרצה התחילה, לחישוב משך ביומן. */
  startedAt: number;
  /**
   * מי הריץ, כפי שנרשם ביומן. חסר = `studio` — גם הקשר שנכתב לפני השדה הזה
   * וגם כל מסלול הלקוחה.
   *
   * **למה זה נשמר ולא נגזר מחדש.** ההשלמה המנותקת כותבת את שורת היומן בעצמה,
   * והיא רצה בלי הבקשה שפתחה את ההרצה. בלי השדה כאן, הרצת קנרית שהבקשה שלה
   * מתה והושלמה מהסריקה הייתה נרשמת כיצירה של לקוחה — כלומר בדיוק השורה
   * שהניקוי לא יידע למחוק, וזו שתישאר ביומן לנצח.
   */
  source?: RunSource;
}

/** למה הסיום לא קרה. הקורא מחליט מה לעשות עם כל אחד. */
export type CompleteOutcome =
  /** הושלם — התוצאה מוכנה והשורה נסגרה. */
  | { kind: "done"; result: unknown }
  /** הקופסה עדיין עובדת. אין מה לעשות מלבד לחכות. */
  | { kind: "running" }
  /** הקופסה לא מכירה את ההרצה — היא קמה מחדש או שהתוקף פג. מה ששולם אבד. */
  | { kind: "lost" }
  /** ההרצה הושלמה ואף מועמד לא עבר את הוולידציה. תוצאה, לא תקלה. */
  | { kind: "rejected"; status: string }
  /**
   * הלקוחה כבר קיבלה תשובה מהרצה **אחרת** על אותו עיצוב, ולכן אין למי לסיים
   * את זו. ראה `supersededByNewerJob`.
   */
  | { kind: "superseded" };

/**
 * ההתראה על גשר צר בכיתוב.
 *
 * אזהרה ולא כשל: הפריט ניתן לייצור, השאלה היא באיזו רזרבה — וזו שאלה שנפתרת
 * בבדיקה, לא בסירוב. הסף (50%) הוא החלטת גל: מתחתיו זה המקרה המתוכנן, והתראה
 * שנדלקת על הנורמלי היא רעש שמאמן להתעלם.
 */
export const LETTERING_BRIDGE_SHARE = 0.5;

export function letteringBridgeCheck(tightShare: number | null): CheckResult[] {
  if (tightShare === null || tightShare < LETTERING_BRIDGE_SHARE) return [];
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

/**
 * האם ההרצה הזו כבר לא שייכת לאיש.
 *
 * **מה זה מונע (AP-0170, 14.8).** הבקשה מתה בשלב השמירה, הלקוחה ראתה שגיאה
 * ולחצה "נסו שוב", וההרצה השנייה — job חדש על אותו עיצוב — החזירה לה תוצאה
 * שהיא בחרה ממנה הצעה. שמונה דקות אחר כך ההשלמה המנותקת הגיעה להרצה הראשונה,
 * כתבה עליה גרסה **שלישית** לאותו עיצוב, וזו הפכה ל-`current_version_id`:
 * העיצוב שהלקוחה בחרה הוחלף בשקט בעיצוב מהרצה שהיא כבר נטשה.
 *
 * ההשלמה המנותקת קיימת בשביל מי שסגרה את הטלפון וההרצה שלה נשארה תלויה. מי
 * שכבר קיבלה תשובה **אחרת** על אותו עיצוב אינה המקרה הזה, וגרסה נוספת אצלה
 * אינה הצלה אלא דריסה.
 *
 * הגבול צר בכוונה: רק יצירה מאפס, כי רק היא כותבת על העיצוב עצמו. בקשת שינוי
 * נשמרת ממילא כדוגמה ממוספרת חדשה (`createSampleDesign`), ולכן היא אינה
 * דורסת דבר — ואין סיבה לזרוק אצלה רנדר ששולם.
 */
async function supersededByNewerJob(jobId: string, ctx: JobContext): Promise<boolean> {
  if (ctx.inputs?.editedFromCurrent) return false;
  return hasNewerFinishedJob(jobId, ctx.designId);
}

/**
 * לאסוף את מה שהקופסה כבר סיימה, ולהשלים ממנו הרצה.
 *
 * **בטוח להריץ פעמיים.** שורת היומן היא upsert על מזהה הניסיון, וסגירת השורה
 * מותנית ב-`running` — כך שגם אם שני קוראים נחתו על אותה הרצה, רק אחד סוגר
 * אותה ורק הוא שולח את המייל. מה ש**כן** אסור להריץ פעמיים הוא `ingestCutouts`,
 * שיוצר גרסה; לכן הקורא חייב לוודא קודם שאין כבר גרסה להרצה הזו — זו בדיוק
 * הבדיקה שקיימת במסלול ההתאוששות, והיא נשארת שם.
 */
export async function completeFromContext(
  jobId: string,
  runId: string,
  ctx: JobContext,
): Promise<CompleteOutcome> {
  if (await supersededByNewerJob(jobId, ctx)) return { kind: "superseded" };
  const box = await collectRenderJob(ctx.boxJobId, ctx.renderPaths, ctx.stagePaths);
  // `null` הוא שני מצבים שאין להבדיל ביניהם מבחוץ — עדיין רצה, או נשכחה.
  // ההבחנה נעשית על השעון של השורה, אצל הקורא: הרצה שעדיין בתוך חלון הזמן
  // הסביר תיקרא שוב, וזו שעברה אותו כבר לא תיאסף לעולם.
  if (!box) return { kind: "lost" };
  return finishFromRender(jobId, runId, ctx, box);
}

/**
 * מה שקורה אחרי שההדמיה בידנו: יומן, מסגור, ולידציה, גרסה, סגירה.
 *
 * מופרד מהאיסוף כי יש לו שני מקורות — הדמיה שנאספה מהקופסה, והדמיה שרונדרה
 * מחדש כשהקופסה כבר לא הכירה את ההרצה. משם והלאה זה אותו דבר בדיוק.
 */
async function finishFromRender(
  jobId: string,
  runId: string,
  ctx: JobContext,
  box: RenderJob,
): Promise<CompleteOutcome> {
  const design = await getDesign(ctx.designId);
  const renderPngPath = box.renderPaths[0] ?? null;

  // היומן קודם להכרעה — גם דחייה נשמרת לאבחון. upsert על מזהה הניסיון, ולכן
  // הרצה שהתחילה להיכתב בבקשה שמתה מתעדכנת ולא מוכפלת.
  await persistRun({
    id: ctx.attemptId,
    source: ctx.source ?? "studio",
    designId: design.id,
    productType: design.product_type,
    prompt: ctx.userPrompt,
    colorKey: "coverage",
    startedAt: ctx.startedAt,
    render: { path: renderPngPath, model: box.model },
    stagePaths: box.stagePaths,
    vectorizer: box.raw,
    renderPrompt: ctx.renderPrompt,
    inputs: {
      ...ctx.inputs,
      deliveredPanels: box.candidates.length,
      approvedPanels: box.candidates.filter((c) => c.status === "approved" && c.cutoutsSvg).length,
      // ההרצה נאספה מהקופסה, וה-usage נאסף איתה: הדמיה ששולמה לפני שהבקשה מתה
      // עלתה בדיוק אותו דבר, וחור במדידה דווקא בהרצות האלה היה מטה את הסכום.
      renderUsage: box.usage ?? undefined,
      // אותו מדד כמו במסלול החי: מה שהוזמן מול מה שהמודל צייר. הרצה שנאספה
      // מהקופסה אינה שונה בשום דבר שרלוונטי לו, וחור במדידה דווקא בהרצות
      // שהתאוששו היה מטה את התשובה על "כמה מההרצות נמתחות".
      ...(ratioGap(box.raw.cutouts_svg as string | undefined, designDims(design)) ?? {}),
      /** הסיום נעשה בלי הבקשה שפתחה. בלי זה אי אפשר להבחין ביומן בין הרצה
       *  שהושלמה כרגיל לבין כזו שנאספה אחרי שהבקשה מתה. */
      completedDetached: true,
    },
    inputImage: null,
  });

  const bridgePlan = { letterBridges: ctx.bridges };
  const RANK = { pass: 0, warn: 1, fail: 2 } as const;
  // story mode — הענף הזה חייב להיות זהה לזה שב-`/api/generate`, ולא "דומה
  // לו": מה שמבדיל את המסלול הוא **המסגור**, וההשלמה המנותקת היא מסגור מלא.
  // עד 15.8 הוא לא היה כאן כלל, וכל הרצת Story שהבקשה שלה מתה נשמרה כמו
  // הרצה רגילה — מסוגרת לרוחב שהוזמן, כלומר עם בדיוק המתיחה האופקית שהמסלול
  // קיים כדי למנוע (AP-0170: ×1.13 על גרסה שנכתבה שמונה דקות אחרי הבקשה).
  const story = isStory(ctx.inputs?.mode);
  const approved = box.candidates.filter((c) => c.status === "approved" && c.cutoutsSvg);
  // כמו במסלול החי: מייצרים לפי היחס ומציגים עד התקרה, והנבחרים הם הקרובים
  // ביותר ליחס שהוזמן. התקרה היא זו שההרצה תוכננה לה (`offeredPanels`), ורק
  // בהיעדרה — שורה שנפתחה לפני שהשדה נשמר — נופלים ל-`MAX_CANDIDATES`.
  const offeredCap = ctx.inputs?.offeredPanels ?? MAX_CANDIDATES;
  const shortlist = pickClosestRatio(approved, (c) => c.cutoutsSvg, designDims(design), offeredCap);
  const ranked = (
    story
      ? await shortlist.reduce<Promise<FramedPreview[]>>(async (acc, c) => {
          const out = await acc;
          const svg = c.cutoutsSvg!;
          out.push(...(await frameCandidates(storyFrameDims(designDims(design), svg), [svg], bridgePlan)));
          return out;
        }, Promise.resolve([]))
      : await frameCandidates(designDims(design), shortlist.map((c) => c.cutoutsSvg!), bridgePlan)
  ).sort((a, b) => RANK[a.report.status] - RANK[b.report.status] || Math.abs(a.stretch - 1) - Math.abs(b.stretch - 1));
  const framed = story ? orderByVariety(ranked) : ranked;

  // ומה עלה בגורל כל אחד מהם. השורה נכתבה למעלה, לפני שהמסגור רץ, ולכן
  // הפסילות שקורות כאן לא הופיעו בה — בדיוק כמו במסלול החי, שם זו הייתה
  // נקודה עיוורת מוכרת (`noteRunVerdicts`). כאן היא פשוט לא נסגרה מעולם:
  // הרצה שהושלמה מנותקת הציגה ביומן `approved` בלי שום זכר למי שנפסל.
  await noteRunVerdicts(ctx.attemptId, framed.map((c) => verdictOf(c.report, c.stretch)));

  if (framed.length === 0) {
    return { kind: "rejected", status: String((box.raw as { status?: string }).status ?? "no candidate") };
  }

  // עריכה שמושלמת בהתאוששות מקבלת דוגמה ממוספרת, בדיוק כמו במסלול הרגיל
  // (החלטת גל, 10.8): תמונה חדשה מהמודל אינה נכתבת כגרסה שנייה על העיצוב
  // הקיים. נוצרת רק אחרי שידוע שיש מה לשמור — דחייה לא משאירה עיצוב ריק.
  const isEdit = Boolean(ctx.inputs?.editedFromCurrent);
  const target = isEdit ? await createSampleDesign(design) : design;

  // story mode — הרוחב של הזוכה הוא הרוחב של העיצוב מכאן והלאה, בדיוק כמו
  // במסלול החי: נקרא מה-viewBox של המועמד שנבחר, נשמר על הרשומה, ונושא את
  // עצמו אל ה-ingest כדי שהמסגור של הזוכה יהיה זהות ולא מתיחה שנייה.
  const storyWidthMm = story ? svgFrame(framed[0].framedSvg)?.widthMm ?? null : null;
  const ingestTarget = storyWidthMm !== null ? { ...target, width_mm: storyWidthMm } : target;
  if (storyWidthMm !== null) await updateDesignWidth(target.id, storyWidthMm);

  const offered = framed.filter((c) => c.report.status !== "fail");
  const raw = (box.raw as { metrics?: Record<string, number> }).metrics;
  const metrics = {
    iou: raw?.iou,
    holes: raw?.vector_holes,
    meanDeviationMm: raw?.mean_contour_deviation_mm,
    maxDeviationMm: raw?.max_contour_deviation_mm,
  };
  const offeredRows = offered.map((c) => ({
    svg: c.framedSvg,
    report: c.report,
    drawnRatio: Math.round(c.drawnRatio * 100) / 100,
    stretch: Math.round(c.stretch * 1000) / 1000,
    bridges: c.bridges,
    spurs: c.spurs ?? [],
  }));

  const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
    design: ingestTarget,
    cutoutsSvg: framed[0].framedSvg,
    userPrompt: ctx.userPrompt,
    renderPngPath,
    metrics,
    candidates: offeredRows,
    generationId: ctx.attemptId,
    extraChecks: letteringBridgeCheck(ctx.tightShare),
    bridgePlan,
    pickedIndex: offeredRows.length > 0 && offered[0] === framed[0] ? 0 : null,
  });

  // מסלול מגודר ולא כתובת חתומה: התשובה הזו נשמרת בשורת ה-job (`claimJobDone`
  // למטה), וכתובת חתומה שנשמרת בטבלה היא סוד שאפשר לקרוא ממנה — ושפג ממילא
  // אחרי שעה. ראה `lib/runs/imageUrl`.
  const renderUrl = renderPngPath ? runImageUrl(ctx.attemptId, "render") : null;
  const result = {
    runId: ctx.attemptId,
    version,
    report,
    geometry,
    lengthMm,
    widthMm,
    candidates: offeredRows,
    render: { model: box.model, url: renderUrl },
    vectorizer: metrics,
    design: {
      id: target.id,
      serial: target.serial,
      root_serial: target.root_serial,
      sample_no: target.sample_no,
    },
  };

  // רק מי שהעביר את השורה מ-`running` שולח את המייל. שני קוראים שנחתו על אותה
  // הרצה יסיימו אותה באותה תוצאה, ורק אחד יודיע עליה.
  //
  // עריכה לא שולחת מייל גם כאן: דוגמה חדשה נולדת עם גרסה 1, אבל "העיצוב שלך
  // מוכן" מובטח פעם אחת ליצירה — לא לכל שינוי.
  if (await claimJobDone(jobId, runId, result)) {
    await notifyDesignReady(target, version.version_no === 1 && !isEdit);
  }
  return { kind: "done", result };
}

/**
 * האם אפשר לרנדר את ההרצה מחדש מתוך ההקשר בלבד — כלומר לקבל **את מה שהלקוחה
 * ביקשה**, ולא משהו שדומה לו.
 *
 * הרצה שנשלחה עם תמונת ייחוס אינה כזו. תמונת ההשראה לא נשמרת אצלנו בגודלה,
 * העיצוב הקיים שנשלח בעריכה אינו בהקשר, ותמונת הכיתוב נחתכת מהפונט בזמן
 * הבקשה. רנדר חוזר בלעדיהם היה מחזיר פריט שמתעלם ממה שצורף — וזה גרוע יותר
 * מלהודות שההרצה אבדה, כי הוא נראה כמו הצלחה.
 *
 * מה שכן: תיאור טקסטואלי. שם ההקשר מחזיק את הכול, והרנדר החוזר זהה למקורי.
 */
export function canRerun(ctx: JobContext): boolean {
  const i = ctx.inputs ?? {};
  if (i.editedFromCurrent) return false;
  if (i.lettering) return false;
  // תמונה שצורפה **ונשלחה**. אחת שנזרקה (`imageDropped`) לא השפיעה על הרנדר
  // מלכתחילה, ולכן היעדרה עכשיו אינו משנה דבר.
  if ((i.imageCount ?? 0) > 0 && !i.imageDropped) return false;
  return true;
}

/**
 * רנדר חוזר, כשהקופסה כבר לא מכירה את ההרצה.
 *
 * **זה עולה כסף** — קריאה נוספת למודל התמונה על בקשה שכבר שולמה פעם אחת.
 * ההצדקה היא שהחלופה גרועה יותר: הלקוחה שילמה ביחידת מכסה ובהמתנה, ומה שהיא
 * מקבלת בלי זה הוא "היצירה לא הושלמה" על משהו שהיא כבר לא נמצאת כאן כדי
 * לנסות שוב. הסייג היחיד הוא נאמנות, לא מחיר — ראה `canRerun`.
 *
 * המזהה בקופסה נגזר מהבקשה, ולכן בקשה זהה מקבלת את אותו מזהה: אין כאן job
 * שלישי שנפתח לצד השניים הקיימים, אלא אותו אחד שנפתח מחדש.
 */
export async function rerunFromContext(
  jobId: string,
  runId: string,
  ctx: JobContext,
): Promise<CompleteOutcome> {
  if (await supersededByNewerJob(jobId, ctx)) return { kind: "superseded" };
  const i = ctx.inputs ?? {};
  const box = await runRenderJob({
    jobId: ctx.attemptId,
    prompt: ctx.renderPrompt,
    calls: (i.calls ?? 1) as 1,
    rows: i.rows ?? 1,
    cols: i.cols ?? 1,
    size: i.canvasSize,
    heightMm: i.widthMm ?? 0,
    colorKey: "coverage",
    minHoleMm: i.minHoleMm ?? 0.5,
    inspiration: null,
    baseSvg: null,
    // story mode — אותו מודל ואותו מאמץ כמו בהרצה המקורית. בלי זה הרנדר החוזר
    // היה קונה תמונה מברירת המחדל של הקופסה, כלומר **לא** את מה שהלקוחה חיכתה
    // לו: שני הפרומפטים של המסלול נכתבו מול `STORY_RENDER`.
    model: isStory(i.mode) ? STORY_RENDER.model : undefined,
    quality: isStory(i.mode) ? STORY_RENDER.quality : undefined,
    renderPaths: ctx.renderPaths,
    stagePaths: ctx.stagePaths,
  });
  return finishFromRender(jobId, runId, { ...ctx, boxJobId: box.boxJobId ?? ctx.boxJobId }, box);
}
