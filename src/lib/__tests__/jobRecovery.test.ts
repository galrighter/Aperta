import { describe, expect, it } from "vitest";
import { mayHaveFinished, resultFromVersion } from "../jobRecovery";
import { JOB_STALE_MS } from "../db/jobs";
import type { VersionRow } from "../db/designs";

// ה-isolate נהרג בין שמירת הגרסה לסגירת ה-job (RM-0084, 3.8): העיצוב שמור,
// השורה תקועה ב-running, והלקוחה רואה "היצירה נכשלה". מה שנבדק כאן הוא ההכרעה
// שמאפשרת להתאושש מזה בקריאה.

const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

describe("mayHaveFinished", () => {
  it("looks during the saving stage — that is when a version is written", () => {
    expect(mayHaveFinished({ stage: "saving", updated_at: at(1_000) })).toBe(true);
  });

  it("does not look while rendering — there is nothing to find yet", () => {
    // דקה וחצי של רנדר כפול סקר כל שנייה = שאילתה בלי סיכוי, בכל יצירה.
    expect(mayHaveFinished({ stage: "rendering", updated_at: at(30_000) })).toBe(false);
  });

  it("looks anyway once the job is stale, whatever the stage", () => {
    // שם החלופה היא להכריז על כישלון, וזה שווה שאילתה.
    expect(mayHaveFinished({ stage: "rendering", updated_at: at(JOB_STALE_MS + 1_000) })).toBe(true);
    expect(mayHaveFinished({ stage: null, updated_at: at(JOB_STALE_MS + 1_000) })).toBe(true);
  });
});

describe("resultFromVersion", () => {
  const version = {
    id: "v-1",
    design_id: "d-1",
    version_no: 3,
    svg: "<svg/>",
    source: "generate",
    user_prompt: null,
    annotation_png_path: null,
    validation_report: { status: "pass" },
    validation_status: "pass",
    created_at: "2026-08-03T21:17:19Z",
    candidates: [{ svg: "<svg/>", report: {} }],
  } as unknown as VersionRow;

  it("rebuilds what the client expects from the saved version", () => {
    const out = resultFromVersion("run-1", version);
    expect(out.runId).toBe("run-1");
    expect(out.version).toEqual({ id: "v-1", version_no: 3, svg: "<svg/>" });
    expect(out.report).toEqual({ status: "pass" });
    expect(out.candidates).toHaveLength(1);
  });

  it("leaves geometry null — the client derives it from the svg", () => {
    // חישובו כאן פירושו boolean ops על כל סקר, והלקוחה כבר משלימה אותו לבדה.
    expect(resultFromVersion("run-1", version).geometry).toBeNull();
  });

  it("survives a version with no candidates", () => {
    const bare = { ...version, candidates: null } as unknown as VersionRow;
    expect(resultFromVersion("run-1", bare).candidates).toEqual([]);
  });
});
