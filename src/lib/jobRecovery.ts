import { JOB_STALE_MS, type GenerationJobRow } from "./db/jobs";
import type { VersionRow } from "./db/designs";

/**
 * התאוששות מ-job שנתקע אחרי שהעבודה כבר הסתיימה.
 *
 * הגרסה נכתבת בסוף `ingestCutouts`, והסגירה (`claimJobDone`) היא הפעולה שמיד אחריה. בין
 * השתיים ה-isolate יכול להיהרג (`exceededResources`, ראו
 * docs/worker-memory-diagnosis.md) — ואז העיצוב שמור והשורה נשארת 'running'.
 * נמדד ב-3.8 על AP-0084: הרצה `approved`, גרסה שנשמרה, job תקוע ב-`saving`,
 * והלקוחה קיבלה "היצירה נכשלה" על עיצוב שקיים.
 *
 * שתי הפונקציות כאן הן ההכרעה בלבד, בלי גישה למסד, כדי שאפשר יהיה לבדוק אותן.
 */

/**
 * האם בכלל שווה לחפש גרסה להרצה הזו.
 *
 * הגרסה נכתבת בשלב `saving` בלבד, ולכן לאורך דקה וחצי של רנדר אין מה לחפש —
 * ושאילתה בכל סקר היא עלות בלי סיכוי. אחרי סף ה"תקוע" בודקים בכל מקרה: שם
 * החלופה היא להכריז על כישלון, וזה שווה שאילתה.
 */
export function mayHaveFinished(
  job: Pick<GenerationJobRow, "stage" | "updated_at">,
  now = Date.now(),
): boolean {
  if (job.stage === "saving") return true;
  return now - new Date(job.updated_at).getTime() > JOB_STALE_MS;
}

/**
 * האם הגרסה ששוחזרה היא הגרסה הראשונה של העיצוב — כלומר יצירה ולא עריכה.
 *
 * זו השאלה ש-`notifyDesignReady` שואל, ובמסלול ההתאוששות אי אפשר לענות עליה
 * דרך `design.current_version_id`: הגרסה כבר נשמרה עד שמגיעים לכאן, השדה כבר
 * מצביע עליה, ובדיקת "אין גרסה קודמת" הייתה יוצאת שקרית **תמיד** — כלומר
 * משתיקה את המייל בדיוק במסלול שנועד להחזיר אותו. `version_no` נספר מ-1
 * (`insertVersion`), ולכן הוא העדות שכן שורדת את השמירה.
 */
export function isFirstVersion(version: Pick<VersionRow, "version_no">): boolean {
  return version.version_no === 1;
}

/** התוצאה כפי שהלקוחה מצפה לה, משוחזרת מהגרסה שנשמרה. */
export interface RecoveredResult {
  runId: string;
  version: { id: string; version_no: number; svg: string };
  report: unknown;
  geometry: null;
  candidates: unknown[];
}

/**
 * בניית התשובה מהגרסה. `geometry` נשאר `null` במכוון: הוא נגזר מה-SVG, הלקוחה
 * כבר משלימה אותו לבדה כשהוא חסר (`/api/validate`), וחישובו כאן פירושו boolean
 * ops על כל סקר.
 */
export function resultFromVersion(runId: string, version: VersionRow): RecoveredResult {
  return {
    runId,
    version: { id: version.id, version_no: version.version_no, svg: version.svg },
    report: version.validation_report ?? null,
    geometry: null,
    candidates: version.candidates ?? [],
  };
}
