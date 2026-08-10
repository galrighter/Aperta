import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { getJob, claimJobDone, failJob, JOB_STALE_MS } from "@/lib/db/jobs";
import { versionForGeneration, getDesign } from "@/lib/db/designs";
import { mayHaveFinished, resultFromVersion, isFirstVersion } from "@/lib/jobRecovery";
import { completeFromContext, type JobContext } from "@/lib/runs/complete";
import { notifyDesignReady } from "@/lib/designReadyNotice";
import { requireDesignAccess } from "@/lib/designAccess";
import { alertStalledJob } from "@/lib/alerts/failures";
import { designSampleCode } from "@/lib/designCode";
import type { DesignRow } from "@/lib/db/designs";

// מצב בקשת יצירה. הלקוחה מושכת מכאן עד ש-status אינו 'running'.
//
// התשובה של הרצה שהסתיימה היא בדיוק מה ש-/api/generate החזירה קודם, כך שהקורא
// לא יודע שמשהו השתנה — רק שהיא כבר לא תלויה בכך שחיבור אחד שרד דקה וחצי.

type Params = { params: Promise<{ jobId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { jobId } = await params;
    const job = await getJob(jobId);
    if (!job) throw new ApiError("not_found", "Unknown generation job", 404);
    // התוצאה של הרצה שהסתיימה היא העיצוב עצמו, ולכן אותה בעלות בדיוק. שורה
    // בלי design_id היא הרצה שנכשלה לפני שהספיקה להיקשר לעיצוב — אין בה מה
    // לשמור עליו מלבד הודעת שגיאה.
    let design: DesignRow | null = null;
    if (job.design_id) design = await requireDesignAccess(req, job.design_id);

    if (job.status === "done") {
      return NextResponse.json({ status: "done", result: job.result });
    }
    if (job.status === "error") {
      return NextResponse.json({ status: "error", error: job.error });
    }

    // ה-isolate יכול להיהרג **אחרי** שהגרסה נשמרה ולפני שנסגר ה-job: הגרסה
    // נכתבת בסוף `ingestCutouts`, ו-`finishJob` הוא הפעולה שאחריה. נמדד ב-3.8
    // על AP-0084 — הרצה שנרשמה `approved`, גרסה שנשמרה, ושורת job שנתקעה
    // ב-`running`/`saving`. הלקוחה קיבלה "היצירה נכשלה" על עיצוב שקיים בשרת,
    // ו"נסה שוב" הוסיף לו גרסה כפולה מאותה הרצה.
    //
    // לכן לפני שמכריזים על כישלון — שואלים את המקור שיודע: האם ההרצה הזו הפיקה
    // גרסה. אם כן, העבודה הסתיימה ומה שחסר הוא רק הרישום. ההכרעה עצמה ב-
    // `lib/jobRecovery`, שם היא נבדקת.
    if (job.design_id && job.run_id && mayHaveFinished(job)) {
      const version = await versionForGeneration(job.run_id);
      if (version) {
        const result = resultFromVersion(job.run_id, version);
        // תיקון השורה, best-effort: סקר הבא יענה מיד, והיומן יפסיק לדווח על
        // הרצה שהצליחה כאילו היא תקועה. כישלון כאן לא מונע את התשובה.
        //
        // התשובה חוזרת בכל מקרה; מה שתלוי בסגירה הוא **המייל** בלבד. הסגירה
        // מותנית ב-`running` ולכן רק סקר אחד מקבל `true`, וזה מה שמונע שני
        // מיילים על אותו עיצוב כששני סקרים נחתו על אותה גרסה.
        const claimed = await claimJobDone(jobId, job.run_id, result);
        if (claimed) {
          // הפער שסוגרים כאן: ב-POST המייל נשלח אחרי `finishJob`, אבל מסלול זה
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
      const outcome = await completeFromContext(jobId, job.run_id, job.context as JobContext);
      if (outcome.kind === "done") return NextResponse.json({ status: "done", result: outcome.result });
      if (outcome.kind === "rejected") {
        const error = { code: "vectorize_failed", message: `Vectorizer did not approve any panel: ${outcome.status}` };
        await failJob(jobId, job.run_id, error);
        return NextResponse.json({ status: "error", error });
      }
      // "אבודה" נופלת להכרזת התקיעה למטה — זו בדיוק המשמעות שלה.
    }

    // ה-isolate שהריץ את העבודה יכול למות בלי לכתוב כלום, ואז השורה נשארת
    // 'running' לנצח. עדיף להודות בכישלון מאשר להשאיר את הלקוחה מול ספינר
    // שלא ייגמר — היא יכולה לנסות שוב.
    if (stalled) {
      // הרגע שבו "תקוע" הפסיק להיות ניחוש: מישהו הסתכל, וההתאוששות לא סגרה.
      // המייל יוצא מיד, עם קישור להרצת הסריקה — במקום לחכות ל-cron שמזגזג.
      // פעם אחת להרצה; לעולם לא מפיל את התשובה ללקוחה.
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
