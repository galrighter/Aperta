import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GenerationJobRow } from "@/lib/db/jobs";

// הסריקה שמסיימת הרצות תקועות בלי שאיש ימתין להן.
//
// מה שנבדק כאן הוא **סדר ההכרעה** בלבד: מתי מתאוששים מגרסה שכבר נשמרה, מתי
// מסיימים מהקופסה, מתי מרנדרים מחדש, ומתי מודים שההרצה אבדה. הצינור עצמו
// נבדק במקומו.

const listStalledJobs = vi.fn();
const failJob = vi.fn();
const claimJobDone = vi.fn();
const versionForGeneration = vi.fn();
const getDesign = vi.fn();
const notifyDesignReady = vi.fn();
const completeFromContext = vi.fn();
const rerunFromContext = vi.fn();

vi.mock("@/lib/db/jobs", () => ({
  listStalledJobs: (...a: unknown[]) => listStalledJobs(...a),
  failJob: (...a: unknown[]) => failJob(...a),
  claimJobDone: (...a: unknown[]) => claimJobDone(...a),
}));
vi.mock("@/lib/db/designs", () => ({
  versionForGeneration: (...a: unknown[]) => versionForGeneration(...a),
  getDesign: (...a: unknown[]) => getDesign(...a),
}));
vi.mock("@/lib/designReadyNotice", () => ({
  notifyDesignReady: (...a: unknown[]) => notifyDesignReady(...a),
}));
vi.mock("../complete", async (orig) => ({
  ...(await orig<typeof import("../complete")>()),
  completeFromContext: (...a: unknown[]) => completeFromContext(...a),
  rerunFromContext: (...a: unknown[]) => rerunFromContext(...a),
}));

const { sweepStalledJobs, RERUN_MAX_AGE_MS } = await import("../sweep");

const NOW = 1_700_000_000_000;

/** הרצה תקועה עם הקשר — טקסט בלבד, כלומר כזו שניתן לרנדר מחדש בנאמנות. */
const job = (over: Partial<GenerationJobRow> = {}, ctx: Record<string, unknown> = {}) =>
  ({
    id: "j-1",
    design_id: "d-1",
    run_id: "r-1",
    status: "running",
    stage: "rendering",
    created_at: new Date(NOW - 10 * 60_000).toISOString(),
    updated_at: new Date(NOW - 8 * 60_000).toISOString(),
    result: null,
    error: null,
    context: { boxJobId: "b-1", attemptId: "r-1", designId: "d-1", inputs: {}, ...ctx },
    ...over,
  }) as unknown as GenerationJobRow;

beforeEach(() => {
  vi.clearAllMocks();
  listStalledJobs.mockResolvedValue([job()]);
  versionForGeneration.mockResolvedValue(null);
  getDesign.mockResolvedValue({ id: "d-1", profile_id: "p-1" });
  claimJobDone.mockResolvedValue(true);
  completeFromContext.mockResolvedValue({ kind: "lost" });
  rerunFromContext.mockResolvedValue({ kind: "done", result: {} });
});

describe("sweepStalledJobs", () => {
  it("מתאושש מגרסה שכבר נשמרה, בלי לגעת בקופסה", async () => {
    // הבדיקה הזו חייבת לקדום לכל השאר: בלעדיה נייצר גרסה שנייה לאותה הרצה.
    versionForGeneration.mockResolvedValue({ id: "v-1", version_no: 1, svg: "<svg/>" });
    const report = await sweepStalledJobs(NOW);
    expect(report.entries[0].outcome).toBe("recovered");
    expect(completeFromContext).not.toHaveBeenCalled();
    expect(notifyDesignReady).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("מסיים מההדמיה שהקופסה עדיין מחזיקה — בלי לשלם שוב", async () => {
    completeFromContext.mockResolvedValue({ kind: "done", result: {} });
    const report = await sweepStalledJobs(NOW);
    expect(report.entries[0].outcome).toBe("completed");
    expect(rerunFromContext).not.toHaveBeenCalled();
  });

  it("סוגר דחיית ווקטורייזר כדי שלא ננסה אותה שוב בכל סבב", async () => {
    completeFromContext.mockResolvedValue({ kind: "rejected", status: "no candidate" });
    const report = await sweepStalledJobs(NOW);
    expect(report.entries[0].outcome).toBe("rejected");
    expect(failJob).toHaveBeenCalledWith("j-1", "r-1", expect.objectContaining({ code: "vectorize_failed" }));
  });

  it("מרנדר מחדש כשהקופסה שכחה, והתיאור מספיק כדי לשחזר", async () => {
    const report = await sweepStalledJobs(NOW);
    expect(rerunFromContext).toHaveBeenCalledOnce();
    expect(report.entries[0].outcome).toBe("rerun");
  });

  it("אינו מרנדר מחדש הרצה שנשלחה עם תמונה — זה לא היה מה שביקשה", async () => {
    // רנדר חוזר בלי הייחוס מחזיר פריט שמתעלם ממה שצורף, וזה גרוע מלהודות
    // שההרצה אבדה: הוא נראה כמו הצלחה.
    listStalledJobs.mockResolvedValue([job({}, { inputs: { imageCount: 1 } })]);
    const report = await sweepStalledJobs(NOW);
    expect(rerunFromContext).not.toHaveBeenCalled();
    expect(report.entries[0].outcome).toBe("abandoned");
    expect(failJob).toHaveBeenCalledWith("j-1", "r-1", expect.objectContaining({ code: "job_stalled" }));
  });

  it("אינו מרנדר מחדש עריכה — העיצוב שנשלח כייחוס אינו בהקשר", async () => {
    listStalledJobs.mockResolvedValue([job({}, { inputs: { editedFromCurrent: true } })]);
    await sweepStalledJobs(NOW);
    expect(rerunFromContext).not.toHaveBeenCalled();
  });

  it("אינו מרנדר מחדש הרצה ישנה — אף אחד כבר לא מחכה לה", async () => {
    listStalledJobs.mockResolvedValue([
      job({ created_at: new Date(NOW - RERUN_MAX_AGE_MS - 1).toISOString() }),
    ]);
    const report = await sweepStalledJobs(NOW);
    expect(rerunFromContext).not.toHaveBeenCalled();
    expect(report.entries[0].outcome).toBe("abandoned");
  });

  it("הרצה שנכשלה אינה עוצרת את הסבב", async () => {
    // הן בלתי תלויות. סריקה שנעצרת על הראשונה משאירה את השאר תקועות — כלומר
    // מייצרת בדיוק את המצב שהיא נועדה לנקות.
    listStalledJobs.mockResolvedValue([job({ id: "j-1" }), job({ id: "j-2" })]);
    completeFromContext.mockRejectedValueOnce(new Error("box down")).mockResolvedValue({ kind: "done", result: {} });
    const report = await sweepStalledJobs(NOW);
    expect(report.scanned).toBe(2);
    expect(report.entries.map((e) => e.outcome)).toEqual(["error", "completed"]);
  });

  it("מדלג על שורה בלי הקשר — אין ממה לסיים", async () => {
    listStalledJobs.mockResolvedValue([job({ context: null })]);
    const report = await sweepStalledJobs(NOW);
    expect(report.entries[0].outcome).toBe("skipped");
    expect(completeFromContext).not.toHaveBeenCalled();
  });
});
