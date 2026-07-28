import { JOB_STALE_MS, type JobListRow } from "@/lib/db/jobs";
import type { RunListRow } from "@/lib/db/runs";

// ניסיון יצירה שאין לו שורת הרצה. שלוש דרכים להגיע לכאן, וכולן נראו ביומן
// אותו דבר — כלומר לא נראו בכלל:
//   · הבקשה נקטעה באמצע וה-isolate מת לפני שהספיק לכתוב (הנפוץ)
//   · היצירה הסתיימה וכתיבת ההרצה עצמה נכשלה
//   · היא עדיין רצה ברגע זה
// "אין שורה" ו"לא היה ניסיון" היו אותה תצוגה, ולכן תלונה כזאת לא הייתה ניתנת
// לאבחון. כאן מייצרים שורת יומן מהמידע שכן קיים — בקשת היצירה.

export interface OrphanItem {
  id: string;
  createdAt: string;
  source: string;
  productType: null;
  prompt: null;
  colorKey: null;
  status: string;
  error: string;
  durationMs: number | null;
  renderModel: null;
  renderUrl: null;
  stages: { conditioned: null; overlay: null; difference: null; rendered: null };
  hasSvg: false;
  metrics: null;
  debug: null;
}

function explain(job: JobListRow, stalled: boolean): string {
  if (job.error?.message) return `הבקשה נכשלה לפני שנרשמה הרצה: ${job.error.message}`;
  if (stalled) return "הבקשה נקטעה באמצע ולא הספיקה לרשום הרצה — כנראה החיבור נסגר בזמן היצירה.";
  if (job.status === "done") return "היצירה הסתיימה אבל כתיבת ההרצה ליומן נכשלה.";
  if (job.status === "error") return "היצירה נכשלה בלי לרשום הרצה.";
  return "היצירה רצה כרגע — עדיין אין לה שורת הרצה.";
}

export function orphanItem(job: JobListRow, now = Date.now()): OrphanItem {
  const running = job.status === "running";
  const stalled = running && now - new Date(job.updated_at).getTime() > JOB_STALE_MS;
  const elapsed = new Date(job.updated_at).getTime() - new Date(job.created_at).getTime();
  return {
    id: job.id,
    createdAt: job.created_at,
    source: "studio",
    productType: null,
    prompt: null,
    colorKey: null,
    status: running && !stalled ? "running" : "error",
    error: explain(job, stalled),
    durationMs: elapsed > 0 ? elapsed : null,
    renderModel: null,
    renderUrl: null,
    stages: { conditioned: null, overlay: null, difference: null, rendered: null },
    hasSvg: false,
    metrics: null,
    debug: null,
  };
}

/**
 * הבקשות שלא הפכו להרצה, בטווח הזמן שהרשימה מציגה ממילא. ההצלבה היא על
 * `run_id` — המזהה שהבקשה הקצתה להרצה לפני שהצינור התחיל.
 */
export function orphanJobs(jobs: JobListRow[], runs: RunListRow[], now = Date.now()): OrphanItem[] {
  const since = runs.length ? new Date(runs[runs.length - 1].created_at).getTime() : 0;
  const seen = new Set(runs.map((r) => r.id));
  return jobs
    .filter((j) => !j.run_id || !seen.has(j.run_id))
    .filter((j) => new Date(j.created_at).getTime() >= since)
    .map((j) => orphanItem(j, now));
}
