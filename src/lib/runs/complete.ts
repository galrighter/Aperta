import { collectRenderJob } from "@/lib/render/service";
import { frameCandidates } from "@/lib/render/frameClient";
import { ingestCutouts, designDims } from "@/lib/vectorizer";
import { persistRun, type PersistRunInput } from "@/lib/runs/persist";
import { getDesign } from "@/lib/db/designs";
import { claimJobDone } from "@/lib/db/jobs";
import { notifyDesignReady } from "@/lib/designReadyNotice";
import { signedUrl } from "@/lib/db/storage";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";
import type { RunStagePaths } from "@/lib/db/runs";
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
  | { kind: "rejected"; status: string };

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
  const box = await collectRenderJob(ctx.boxJobId, ctx.renderPaths, ctx.stagePaths);
  // `null` הוא שני מצבים שאין להבדיל ביניהם מבחוץ — עדיין רצה, או נשכחה.
  // ההבחנה נעשית על השעון של השורה, אצל הקורא: הרצה שעדיין בתוך חלון הזמן
  // הסביר תיקרא שוב, וזו שעברה אותו כבר לא תיאסף לעולם.
  if (!box) return { kind: "lost" };

  const design = await getDesign(ctx.designId);
  const renderPngPath = box.renderPaths[0] ?? null;

  // היומן קודם להכרעה — גם דחייה נשמרת לאבחון. upsert על מזהה הניסיון, ולכן
  // הרצה שהתחילה להיכתב בבקשה שמתה מתעדכנת ולא מוכפלת.
  await persistRun({
    id: ctx.attemptId,
    source: "studio",
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
      /** הסיום נעשה בלי הבקשה שפתחה. בלי זה אי אפשר להבחין ביומן בין הרצה
       *  שהושלמה כרגיל לבין כזו שנאספה אחרי שהבקשה מתה. */
      completedDetached: true,
    },
    inputImage: null,
  });

  const bridgePlan = { letterBridges: ctx.bridges };
  const RANK = { pass: 0, warn: 1, fail: 2 } as const;
  const approved = box.candidates.filter((c) => c.status === "approved" && c.cutoutsSvg);
  const framed = (await frameCandidates(designDims(design), approved.map((c) => c.cutoutsSvg!), bridgePlan))
    .sort((a, b) => RANK[a.report.status] - RANK[b.report.status] || Math.abs(a.stretch - 1) - Math.abs(b.stretch - 1));

  if (framed.length === 0) {
    return { kind: "rejected", status: String((box.raw as { status?: string }).status ?? "no candidate") };
  }

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
  }));

  const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
    design,
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

  const renderUrl = renderPngPath ? await signedUrl(renderPngPath, 3600).catch(() => null) : null;
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
  };

  // רק מי שהעביר את השורה מ-`running` שולח את המייל. שני קוראים שנחתו על אותה
  // הרצה יסיימו אותה באותה תוצאה, ורק אחד יודיע עליה.
  if (await claimJobDone(jobId, runId, result)) {
    await notifyDesignReady(design, version.version_no === 1);
  }
  return { kind: "done", result };
}
