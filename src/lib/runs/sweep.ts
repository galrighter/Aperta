import {
  listStalledJobs, failJob, claimJobDone, claimRecovery, type GenerationJobRow,
} from "@/lib/db/jobs";
import { versionForGeneration, getDesign } from "@/lib/db/designs";
import { resultFromVersion, isFirstVersion } from "@/lib/jobRecovery";
import { notifyDesignReady } from "@/lib/designReadyNotice";
import { completeFromContext, rerunFromContext, canRerun, type JobContext } from "./complete";

// המנוע מסיים לבד.
//
// עד כאן מי שסיים הרצה תקועה היה מי שהגיע לשורה — כלומר דפדפן פתוח באיזשהו
// מקום באתר. לקוחה שסגרה את הטלפון ולא חזרה תוך רבע שעה לא הפעילה אף אחד,
// וההרצה שלה נשארה תלויה עד שהוכרזה תקועה. כאן זה נסגר: סריקה תקופתית עוברת
// על ההרצות שנתקעו ומסיימת אותן בלי שאיש ימתין להן.
//
// הסריקה אינה יודעת שום דבר חדש — היא קורא נוסף לאותה פעולה שכבר משרתת את
// הבקשה המקורית ואת מסך המצב (`runs/complete.ts`). מה שהיא מוסיפה הוא היוזמה.

/** כמה הרצות לסבב. תקרה ולא יעד: כל אחת היא מסגור, ולידציה ושמירה. */
export const SWEEP_LIMIT = 10;

/**
 * עד איזה גיל שווה לרנדר מחדש הרצה שהקופסה שכחה.
 *
 * רנדר חוזר עולה כסף אמיתי, ומה שהוא קונה הוא לקוחה שתמצא את העיצוב שלה
 * כשתחזור. אחרי יום זה כבר לא מה שקורה: היא ראתה "לא הושלם", המשיכה הלאה,
 * ומה שיתקבל הוא עיצוב שאיש לא מחכה לו. שעה נבחרה כטווח שבו החזרה עדיין
 * סבירה — וגם כגבול על ההוצאה, אם משהו במעלה הזרם מייצר הרצות תקועות בסדרה.
 */
export const RERUN_MAX_AGE_MS = 60 * 60_000;

/**
 * עד איזה גיל מייל "העיצוב שלך מוכן" הוא בשורה ולא בלבול.
 *
 * הסריקה סוגרת גם הרצות ישנות מאוד — שורה שנתקעה לפני שבוע ואיש לא הגיע
 * אליה נסגרת בסבב הראשון שרואה אותה. הסגירה עצמה נכונה בכל גיל; המייל אינו.
 * "העיצוב שלך מוכן" על משהו שהלקוחה ראתה נכשל, עזבה, והמשיכה הלאה — הוא
 * הודעה על דבר שהיא כבר לא מחכה לו, והלינק שבו מוביל לעיצוב שאין לה הקשר
 * אליו יותר.
 *
 * יממה, ולא שעה כמו `RERUN_MAX_AGE_MS`: שם הגבול הוא גם הוצאה כספית, וכאן
 * אין מחיר מלבד הרלוונטיות. מי שחזרה למחרת עדיין תשמח למצוא אותו.
 */
export const NOTIFY_MAX_AGE_MS = 24 * 60 * 60_000;

export interface SweepEntry {
  jobId: string;
  outcome:
    | "recovered" | "completed" | "rerun" | "rejected" | "abandoned"
    | "superseded" | "skipped" | "error";
  detail?: string;
}

export interface SweepReport {
  scanned: number;
  entries: SweepEntry[];
}

/**
 * סבב אחד.
 *
 * הכשלת הרצה אחת אינה מפילה את הסבב: הן בלתי תלויות, וסריקה שנעצרת על
 * הראשונה שנכשלה משאירה את כל השאר תקועות — כלומר מייצרת בדיוק את המצב שהיא
 * נועדה לנקות.
 */
export async function sweepStalledJobs(now = Date.now()): Promise<SweepReport> {
  const jobs = await listStalledJobs(SWEEP_LIMIT);
  const entries: SweepEntry[] = [];
  for (const job of jobs) {
    try {
      entries.push(await sweepOne(job, now));
    } catch (e) {
      console.error(`sweep: job ${job.id} failed:`, (e as Error).message);
      entries.push({ jobId: job.id, outcome: "error", detail: (e as Error).message });
    }
  }
  return { scanned: jobs.length, entries };
}

async function sweepOne(job: GenerationJobRow, now: number): Promise<SweepEntry> {
  const jobId = job.id;
  if (!job.design_id || !job.run_id) return { jobId, outcome: "skipped" };
  const ctx = (job.context ?? null) as JobContext | null;

  // קודם כול: אולי הגרסה כבר נשמרה והשורה רק לא נסגרה. זו הבדיקה שחייבת
  // לקדום לכל השאר — בלעדיה נייצר גרסה שנייה לאותה הרצה.
  //
  // **והיא אינה דורשת `context`.** זה הסדר שנשבר כאן קודם: התנאי על ההקשר
  // ישב בשורה הראשונה של הפונקציה ופסל את השורה לפני שמישהו שאל אם היא
  // בכלל הצליחה. שורה שההרצה שלה נשמרה ומתה לפני הסגירה צריכה `run_id`
  // בלבד — וזו בדיוק השורה שנשארה `running` שמונה ימים (ראו `listStalledJobs`).
  //
  // לפי מזהה הניסיון ולא לפי `run_id` — ראו את אותה הערה במסלול המשיכה
  // (`api/generate/[jobId]`): הרצה שהצליחה בניסיון השני שמורה תחת מזהה אחר.
  // בלי הקשר אין מזהה ניסיון, ו-`run_id` הוא מה שיש.
  const attemptId = ctx?.attemptId ?? job.run_id;
  const version = await versionForGeneration(attemptId);
  if (version) {
    if (await claimJobDone(jobId, job.run_id, resultFromVersion(attemptId, version))) {
      try {
        // העיצוב של **הגרסה**, לא של ה-job: גרסת עריכה יושבת על דוגמה ממוספרת,
        // והמייל צריך להצביע עליה. עריכה ממילא לא שולחת מייל — ראו complete.ts.
        const isEdit = Boolean(ctx?.inputs?.editedFromCurrent);
        const fresh = now - new Date(job.created_at).getTime() <= NOTIFY_MAX_AGE_MS;
        await notifyDesignReady(await getDesign(version.design_id), fresh && isFirstVersion(version) && !isEdit);
      } catch (e) {
        console.error("sweep: design-ready mail skipped:", (e as Error).message);
      }
    }
    return { jobId, outcome: "recovered" };
  }

  // מכאן והלאה הכול נשען על ההקשר — איסוף מהקופסה, מסגור, שמירה. בלעדיו אין
  // מה לעשות מלבד לדלג. הדילוג כאן ולא בראש הפונקציה הוא כל התיקון: השורה
  // עולה שאילתה אחת ("יש כבר גרסה?") במקום להיפסל לפניה.
  if (!ctx) return { jobId, outcome: "skipped", detail: "no context to finish from" };

  // ותפיסת בעלות לפני העבודה, מאותה סיבה בדיוק: הבדיקה שלמעלה היא
  // בדיקה-ואז-פעולה, והלקוחה מושכת במקביל לסריקה. `claimRecovery` הוא מה
  // שמכריע מי מהם מריץ את ה-ingest — ולא שניהם (ראו את שבע הגרסאות ב-13.8).
  if (!(await claimRecovery(jobId, job.run_id, job.updated_at))) {
    return { jobId, outcome: "skipped", detail: "someone else is completing it" };
  }

  const outcome = await completeFromContext(jobId, job.run_id, ctx);
  if (outcome.kind === "done") return { jobId, outcome: "completed" };
  if (outcome.kind === "superseded") return superseded(jobId, job.run_id);
  if (outcome.kind === "rejected") {
    await failJob(jobId, job.run_id, {
      code: "vectorize_failed",
      message: `Vectorizer did not approve any panel: ${outcome.status}`,
    });
    return { jobId, outcome: "rejected", detail: outcome.status };
  }
  // "עדיין רצה" לא אמור להגיע לכאן — השורה כבר עברה את סף התקיעה — אבל אם
  // הגיע, אין מה לעשות מלבד להשאיר אותה לסבב הבא.
  if (outcome.kind === "running") return { jobId, outcome: "skipped", detail: "still running" };

  // הקופסה שכחה את ההרצה. מכאן זו החלטה על כסף: לרנדר מחדש, או להודות שאבדה.
  const age = now - new Date(job.created_at).getTime();
  if (age > RERUN_MAX_AGE_MS) return abandon(jobId, job.run_id, "too old to re-run");
  if (!canRerun(ctx)) return abandon(jobId, job.run_id, "reference is gone — a re-run would not be what was asked");

  const again = await rerunFromContext(jobId, job.run_id, ctx);
  if (again.kind === "done") return { jobId, outcome: "rerun" };
  if (again.kind === "superseded") return superseded(jobId, job.run_id);
  if (again.kind === "rejected") {
    await failJob(jobId, job.run_id, {
      code: "vectorize_failed",
      message: `Vectorizer did not approve any panel: ${again.status}`,
    });
    return { jobId, outcome: "rejected", detail: again.status };
  }
  return abandon(jobId, job.run_id, "re-render did not produce a result");
}

/**
 * להודות שההרצה אבדה — ולכתוב את זה לשורה.
 *
 * בלי הכתיבה הזו הסריקה הייתה מוצאת את אותה הרצה בכל סבב, מנסה לאסוף אותה
 * שוב, ומדווחת עליה שוב: עבודה חוזרת על משהו שכבר ידוע. הלקוחה ממילא רואה
 * `job_stalled` — כאן זה רק נהיה סופי.
 */
async function abandon(jobId: string, runId: string, detail: string): Promise<SweepEntry> {
  await failJob(jobId, runId, { code: "job_stalled", message: "Generation stopped responding" });
  return { jobId, outcome: "abandoned", detail };
}

/**
 * הרצה שהלקוחה כבר לא מחכה לה — היא קיבלה תשובה מהרצה מאוחרת יותר על אותו
 * עיצוב. נסגרת בלי גרסה, כדי שהסבב הבא לא ינסה שוב ושלא תיכתב גרסה שתדרוס
 * את מה שנבחר. ראה `supersededByNewerJob`.
 */
async function superseded(jobId: string, runId: string): Promise<SweepEntry> {
  await failJob(jobId, runId, {
    code: "job_superseded",
    message: "A later generation on this design already finished",
  });
  return { jobId, outcome: "superseded" };
}
