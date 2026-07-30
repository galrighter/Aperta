import { describe, it, expect } from "vitest";
import { orphanJobs, orphanItem } from "../orphans";
import { JOB_STALE_MS, type JobListRow } from "@/lib/db/jobs";
import type { RunListRow } from "@/lib/db/runs";

// ניסיון יצירה שלא הפך להרצה היה נעדר מהיומן לגמרי, ולכן תלונה עליו לא הייתה
// ניתנת לאבחון: "אין שורה" ו"לא היה ניסיון" הם אותה תצוגה. כאן נבדק שהניסיון
// כן מופיע, ושמה שכתוב עליו אומר למה אין לו הרצה.

const NOW = Date.parse("2026-07-28T04:00:00Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const job = (over: Partial<JobListRow> = {}): JobListRow => ({
  id: "j1",
  created_at: at(90_000),
  updated_at: at(80_000),
  design_id: "d1",
  run_id: "r1",
  status: "running",
  stage: "rendering",
  error: null,
  ...over,
});

const run = (over: Partial<RunListRow> = {}): RunListRow =>
  ({ id: "r1", created_at: at(120_000), ...over }) as RunListRow;

describe("orphan jobs in the log", () => {
  it("leaves out a job that already has its run", () => {
    expect(orphanJobs([job()], [run({ id: "r1" })], { now: NOW })).toEqual([]);
  });

  it("surfaces a job whose run was never written", () => {
    const [item] = orphanJobs([job({ run_id: "r-missing" })], [run({ id: "r1" })], { now: NOW });
    expect(item.id).toBe("j1");
    expect(item.hasSvg).toBe(false);
  });

  it("calls a long-silent job cut off, not still running", () => {
    const item = orphanItem(job({ updated_at: at(JOB_STALE_MS + 1000) }), NOW);
    expect(item.status).toBe("error");
    expect(item.error).toContain("נקטעה");
  });

  it("leaves a job that is still working marked as running", () => {
    const item = orphanItem(job({ updated_at: at(10_000) }), NOW);
    expect(item.status).toBe("running");
    expect(item.error).toContain("רצה כרגע");
  });

  it("says the log write failed when the job itself finished", () => {
    const item = orphanItem(job({ status: "done", updated_at: at(10_000) }), NOW);
    expect(item.error).toContain("כתיבת ההרצה ליומן נכשלה");
  });

  it("repeats the job's own error when it has one", () => {
    const item = orphanItem(job({ status: "error", error: { code: "llm_error", message: "Billing hard limit" } }), NOW);
    expect(item.status).toBe("error");
    expect(item.error).toContain("Billing hard limit");
  });

  it("leaves an old job to a later page when there is one", () => {
    // אחרת בקשה שנקטעה לפני שבוע הייתה מופיעה בראש העמוד הראשון, בין הרצות
    // של היום — ואז שוב בעמוד שלה.
    const old = job({ id: "j-old", run_id: "r-gone", created_at: at(999_000) });
    const page = [run({ created_at: at(120_000) })];
    expect(orphanJobs([old], page, { now: NOW, toEnd: false })).toEqual([]);
  });

  it("shows that same old job once the last page is reached", () => {
    // בעמוד האחרון אין מתחת עמוד נוסף שיציג אותה, ולכן כאן היא כן שייכת.
    const old = job({ id: "j-old", run_id: "r-gone", created_at: at(999_000) });
    const [item] = orphanJobs([old], [run({ created_at: at(120_000) })], { now: NOW });
    expect(item.id).toBe("j-old");
  });

  it("keeps a job out of a page that starts below it", () => {
    // `before` הוא הגבול העליון של העמוד: מה שקדם לו נמצא בעמוד שכבר נטען.
    const recent = job({ id: "j-new", run_id: "r-gone", created_at: at(10_000) });
    expect(orphanJobs([recent], [], { now: NOW, before: at(60_000) })).toEqual([]);
  });
});
