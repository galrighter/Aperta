import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { getJob, finishJob, JOB_STALE_MS } from "@/lib/db/jobs";
import { versionForGeneration } from "@/lib/db/designs";
import { mayHaveFinished, resultFromVersion } from "@/lib/jobRecovery";
import { requireDesignAccess } from "@/lib/designAccess";

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
    if (job.design_id) await requireDesignAccess(req, job.design_id);

    if (job.status === "done") {
      return NextResponse.json({ status: "done", result: job.result });
    }
    if (job.status === "error") {
      return NextResponse.json({ status: "error", error: job.error });
    }

    // ה-isolate יכול להיהרג **אחרי** שהגרסה נשמרה ולפני שנסגר ה-job: הגרסה
    // נכתבת בסוף `ingestCutouts`, ו-`finishJob` הוא הפעולה שאחריה. נמדד ב-3.8
    // על RM-0084 — הרצה שנרשמה `approved`, גרסה שנשמרה, ושורת job שנתקעה
    // ב-`running`/`saving`. הלקוחה קיבלה "היצירה נכשלה" על עיצוב שקיים בשרת,
    // ו"נסה שוב" הוסיף לו גרסה כפולה מאותה הרצה.
    //
    // לכן לפני שמכריזים על כישלון — שואלים את המקור שיודע: האם ההרצה הזו הפיקה
    // גרסה. אם כן, העבודה הסתיימה ומה שחסר הוא רק הרישום. ההכרעה עצמה ב-
    // `lib/jobRecovery`, שם היא נבדקת.
    if (job.design_id && job.run_id && mayHaveFinished(job)) {
      const version = await versionForGeneration(job.design_id, job.run_id);
      if (version) {
        const result = resultFromVersion(job.run_id, version);
        // תיקון השורה, best-effort: סקר הבא יענה מיד, והיומן יפסיק לדווח על
        // הרצה שהצליחה כאילו היא תקועה. כישלון כאן לא מונע את התשובה.
        await finishJob(jobId, job.run_id, result);
        return NextResponse.json({ status: "done", result });
      }
    }

    // ה-isolate שהריץ את העבודה יכול למות בלי לכתוב כלום, ואז השורה נשארת
    // 'running' לנצח. עדיף להודות בכישלון מאשר להשאיר את הלקוחה מול ספינר
    // שלא ייגמר — היא יכולה לנסות שוב.
    if (Date.now() - new Date(job.updated_at).getTime() > JOB_STALE_MS) {
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
