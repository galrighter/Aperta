import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { getJob, claimJobDone, claimRecovery, failJob, JOB_STALE_MS } from "@/lib/db/jobs";
import { versionForGeneration, getDesign } from "@/lib/db/designs";
import { mayHaveFinished, resultFromVersion, isFirstVersion } from "@/lib/jobRecovery";
import { canRerun, completeFromContext, rerunFromContext, type JobContext } from "@/lib/runs/complete";
import { RERUN_MAX_AGE_MS } from "@/lib/runs/sweep";
import { notifyDesignReady } from "@/lib/designReadyNotice";
import { requireDesignAccess } from "@/lib/designAccess";
import { readAccountId } from "@/lib/account";
import { alertStalledJob } from "@/lib/alerts/failures";
import { designSampleCode } from "@/lib/designCode";
import type { DesignRow } from "@/lib/db/designs";

// מצב בקשת יצירה. הלקוחה מושכת מכאן עד ש-status אינו 'running'.
//
// התשובה של הרצה שהסתיימה היא בדיוק מה ש-/api/generate החזירה קודם, כך שהקורא
// לא יודע שמשהו השתנה — רק שהיא כבר לא תלויה בכך שחיבור אחד שרד דקה וחצי.

type Params = { params: Promise<{ jobId: string }> };

// ההתאוששות יכולה לכלול רנדר מחדש (~30-60 שניות) נוסף על מסגור ושמירה.
export const maxDuration = 300;

export async function GET(req: Request, { params }: Params) {
  try {
    const { jobId } = await params;
    const job = await getJob(jobId);
    if (!job) throw new ApiError("not_found", "Unknown generation job", 404);
    // התוצאה של הרצה שהסתיימה היא העיצוב עצמו, ולכן אותה בעלות בדיוק. שורה
    // בלי design_id היא הרצה שנכשלה לפני שהספיקה להיקשר לעיצוב — אין בה מה
    // לשמור עליו מלבד הודעת שגיאה.
    //
    // **ושורה כזאת אינה נענית לזרים.** ההשפעה נמוכה — הגישה מגודרת ב-UUID
    // ומה שנחשף הוא מחרוזת שגיאה — אבל "נמוכה" אינה "אפס", ומסלול שמדלג על
    // בדיקת בעלות הוא חריג שצריך הצדקה (docs/FULL_AUDIT_2026-08.md, פרק 2).
    // ‏404 גנרי ולא 403: מי שאין לו עסק עם השורה הזאת לא אמור ללמוד ממנה
    // אפילו שהיא קיימת.
    let design: DesignRow | null = null;
    if (job.design_id) {
      design = await requireDesignAccess(req, job.design_id);
    } else if (!(await readAccountId(req))) {
      throw new ApiError("not_found", "Unknown generation job", 404);
    }

    if (job.status === "done") {
      return NextResponse.json({ status: "done", result: job.result });
    }
    if (job.status === "error") {
      return NextResponse.json({ status: "error", error: job.error });
    }

    // ה-isolate יכול להיהרג **אחרי** שהגרסה נשמרה ולפני שנסגר ה-job: הגרסה
    // נכתבת בסוף `ingestCutouts`, והסגירה היא הפעולה שאחריה. נמדד ב-3.8
    // על AP-0084 — הרצה שנרשמה `approved`, גרסה שנשמרה, ושורת job שנתקעה
    // ב-`running`/`saving`. הלקוחה קיבלה "היצירה נכשלה" על עיצוב שקיים בשרת,
    // ו"נסה שוב" הוסיף לו גרסה כפולה מאותה הרצה.
    //
    // לכן לפני שמכריזים על כישלון — שואלים את המקור שיודע: האם ההרצה הזו הפיקה
    // גרסה. אם כן, העבודה הסתיימה ומה שחסר הוא רק הרישום. ההכרעה עצמה ב-
    // `lib/jobRecovery`, שם היא נבדקת.
    //
    // ולפי מזהה הניסיון, לא לפי `run_id`: שורת ה-job נושאת את מזהה הניסיון
    // הראשון ואינה מתעדכנת בשני, בזמן ש-`ingestCutouts` מקבל `generationId` של
    // הניסיון שרץ בפועל. על הרצה שהצליחה רק בניסיון השני החיפוש לפי `run_id`
    // לבדו מחמיץ גרסה שקיימת, ומכריז `job_stalled` על עיצוב ששמור אצלנו.
    // ההקשר הוא מי שיודע מי רץ אחרון — `setJobContext` נכתב בכל ניסיון.
    const attemptOf = (runId: string) => (job.context as JobContext | null)?.attemptId ?? runId;
    if (job.design_id && job.run_id && mayHaveFinished(job)) {
      const attemptId = attemptOf(job.run_id);
      const version = await versionForGeneration(attemptId);
      if (version) {
        const result = resultFromVersion(attemptId, version);
        // תיקון השורה, best-effort: סקר הבא יענה מיד, והיומן יפסיק לדווח על
        // הרצה שהצליחה כאילו היא תקועה. כישלון כאן לא מונע את התשובה.
        //
        // התשובה חוזרת בכל מקרה; מה שתלוי בסגירה הוא **המייל** בלבד. הסגירה
        // מותנית ב-`running` ולכן רק סקר אחד מקבל `true`, וזה מה שמונע שני
        // מיילים על אותו עיצוב כששני סקרים נחתו על אותה גרסה.
        const claimed = await claimJobDone(jobId, job.run_id, result);
        if (claimed) {
          // הפער שסוגרים כאן: ב-POST המייל נשלח אחרי הסגירה, אבל מסלול זה
          // קיים בדיוק כי ה-isolate של ה-POST נהרג לפני כן — כלומר בהתאוששות
          // אף אחד לא שלח אותו. לקוחה שה-isolate שלה מת **וגם** סגרה את החלון
          // לא קיבלה שום הודעה על עיצוב שמוכן ושמור אצלנו.
          //
          // `isFirstVersion` ולא `current_version_id`: הגרסה כבר נשמרה, והשדה
          // כבר מצביע עליה. ראו את ההערה ב-`lib/jobRecovery`.
          //
          // ה-try הוא על `getDesign` בלבד — `notifyDesignReady` כבר בולע את
          // שלו. בלעדיו קריאת עיצוב שנכשלת הייתה הופכת התאוששות **מוצלחת**
          // ל-500, כלומר בדיוק ל"היצירה נכשלה" על עיצוב שקיים — הכשל שהמסלול
          // הזה נבנה כדי למנוע. ההתראה לעולם לא מכריעה את התשובה.
          try {
            // העיצוב של **הגרסה**: גרסת עריכה יושבת על דוגמה ממוספרת, לא על
            // העיצוב ששורת ה-job מצביעה עליו. עריכה ממילא אינה שולחת מייל.
            const isEdit = Boolean((job.context as JobContext | null)?.inputs?.editedFromCurrent);
            const design = await getDesign(version.design_id);
            await notifyDesignReady(design, isFirstVersion(version) && !isEdit);
          } catch (e) {
            console.error("design-ready mail skipped:", (e as Error).message);
          }
        }
        return NextResponse.json({ status: "done", result });
      }
    }

    // אין גרסה, אבל ההרצה אולי סיימה בקופסה ורק לא היה מי שיאסוף אותה: הבקשה
    // שפתחה אותה מתה **לפני** השמירה. עד כאן זה היה סוף הסיפור — היא הוכרזה
    // תקועה, וההדמיה ששולמה נזרקה. עכשיו ההקשר יושב בשורה, וכל פנייה יכולה
    // לסיים ממנו (0019, `runs/complete.ts`).
    //
    // רק אחרי סף ה"תקוע": כל עוד ההרצה בזמנים סבירים, מי שפתח אותה עדיין
    // עשוי לסיים אותה בעצמו, ושתי השלמות במקביל הן בזבוז — לא נזק, כי הסגירה
    // מותנית ב-`running`, אבל בזבוז.
    const stalled = Date.now() - new Date(job.updated_at).getTime() > JOB_STALE_MS;
    if (stalled && job.design_id && job.run_id && job.context) {
      const ctx = job.context as JobContext;
      // ההשלמה נתפסת לפני שהיא מתחילה. הבדיקה שלמעלה ("יש כבר גרסה?") אינה
      // מספיקה לבדה: היא בדיקה-ואז-פעולה מול עבודה שנמשכת שניות, ומי שמושך
      // כל שנייה וחצי מפסיד אותה בוודאות — ראה `claimRecovery` ואת שבע
      // הגרסאות הזהות שזה ייצר ב-13.8. מי שלא תפס חוזר "עדיין רצה"; הבעלים
      // כבר דחף את `updated_at`, ולכן הסקר הבא לא יראה שורה נטושה.
      if (!(await claimRecovery(jobId, job.run_id, job.updated_at))) {
        return NextResponse.json({ status: "running", stage: job.stage });
      }
      const outcome = await completeFromContext(jobId, job.run_id, ctx);
      if (outcome.kind === "done") return NextResponse.json({ status: "done", result: outcome.result });
      // הלקוחה כבר קיבלה תשובה מהרצה מאוחרת יותר על אותו עיצוב. השורה נסגרת
      // כדי שאיש לא ינסה שוב, ובלי לכתוב גרסה שתדרוס את מה שהיא בחרה.
      if (outcome.kind === "superseded") {
        const error = { code: "job_superseded", message: "A later generation on this design already finished" };
        await failJob(jobId, job.run_id, error);
        return NextResponse.json({ status: "error", error });
      }
      if (outcome.kind === "rejected") {
        const error = { code: "vectorize_failed", message: `Vectorizer did not approve any panel: ${outcome.status}` };
        await failJob(jobId, job.run_id, error);
        return NextResponse.json({ status: "error", error });
      }

      // הקופסה שכחה את ההרצה. אותו סולם בדיוק כמו הסריקה — כי למה לחכות לה:
      // מי שמסתכל עכשיו הוא בדיוק הלקוח שמחכה לתשובה, ורנדר מחדש (בגבולות
      // הנאמנות והגיל של הסריקה) מחזיר לו את מה ששילם עליו במקום "נכשל".
      // הלקוח מושך סדרתית — משיכה אחת בכל רגע — ולכן אין כאן רנדר-מחדש כפול;
      // שני מכשירים על אותה הרצה ייפגשו באותו מזהה קופסה ובסגירה מותנית.
      if (outcome.kind === "lost") {
        const age = Date.now() - new Date(job.created_at).getTime();
        if (age <= RERUN_MAX_AGE_MS && canRerun(ctx)) {
          const again = await rerunFromContext(jobId, job.run_id, ctx);
          if (again.kind === "done") return NextResponse.json({ status: "done", result: again.result });
          if (again.kind === "superseded") {
            const error = { code: "job_superseded", message: "A later generation on this design already finished" };
            await failJob(jobId, job.run_id, error);
            return NextResponse.json({ status: "error", error });
          }
          if (again.kind === "rejected") {
            const error = { code: "vectorize_failed", message: `Vectorizer did not approve any panel: ${again.status}` };
            await failJob(jobId, job.run_id, error);
            return NextResponse.json({ status: "error", error });
          }
        }
        // אי אפשר לרנדר מחדש (רפרנס שאבד, ישן מדי) או שגם הרנדר החוזר לא
        // הניב — ההרצה אבודה באמת. נסגרת סופית, כמו בסריקה, כדי שאף קורא
        // הבא לא ינסה שוב לנצח.
        await failJob(jobId, job.run_id, { code: "job_stalled", message: "Generation stopped responding" });
      }
    }

    // ה-isolate שהריץ את העבודה יכול למות בלי לכתוב כלום, ואז השורה נשארת
    // 'running' לנצח. עדיף להודות בכישלון מאשר להשאיר את הלקוחה מול ספינר
    // שלא ייגמר — היא יכולה לנסות שוב.
    if (stalled) {
      // לכאן מגיעים רק אחרי שהמערכת ניסתה הכול בעצמה — השלמה, ואם מותר גם
      // רנדר מחדש. המייל אינו בקשת פעולה אלא ידיעה: לקוח שילם בהמתנה וקיבל
      // כישלון, וזה משהו שצריך לדעת עליו. פעם אחת להרצה; לעולם לא מפיל את
      // התשובה ללקוח.
      await alertStalledJob({ jobId, designRef: design ? designSampleCode(design) : null });
      return NextResponse.json({
        status: "error",
        error: { code: "job_stalled", message: "Generation stopped responding" },
      });
    }

    return NextResponse.json({ status: "running", stage: job.stage });
  } catch (err) {
    return handleRouteError(err);
  }
}
