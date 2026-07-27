import { NextResponse } from "next/server";
import { handleRouteError, ApiError } from "@/lib/api";
import { getJob, JOB_STALE_MS } from "@/lib/db/jobs";

// מצב בקשת יצירה. הלקוחה מושכת מכאן עד ש-status אינו 'running'.
//
// התשובה של הרצה שהסתיימה היא בדיוק מה ש-/api/generate החזירה קודם, כך שהקורא
// לא יודע שמשהו השתנה — רק שהיא כבר לא תלויה בכך שחיבור אחד שרד דקה וחצי.

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { jobId } = await params;
    const job = await getJob(jobId);
    if (!job) throw new ApiError("not_found", "Unknown generation job", 404);

    if (job.status === "done") {
      return NextResponse.json({ status: "done", result: job.result });
    }
    if (job.status === "error") {
      return NextResponse.json({ status: "error", error: job.error });
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
