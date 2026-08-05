import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GenerationJobRow } from "@/lib/db/jobs";
import type { DesignRow, VersionRow } from "@/lib/db/designs";

// מסלול ההתאוששות: ה-isolate נהרג אחרי שהגרסה נשמרה ולפני שנסגר ה-job
// (RM-0084, 3.8). ה-GET מוצא את הגרסה ומחזיר את התוצאה — אבל עד התיקון הזה הוא
// לא שלח את מייל "העיצוב מוכן", בניגוד ל-POST. לקוחה שה-isolate שלה מת **וגם**
// סגרה את החלון לא קיבלה שום הודעה על עיצוב שמוכן ושמור אצלנו.

const getJob = vi.fn();
const claimJobDone = vi.fn();
const versionForGeneration = vi.fn();
const getDesign = vi.fn();
const notifyDesignReady = vi.fn();
const requireDesignAccess = vi.fn();

vi.mock("@/lib/db/jobs", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/jobs")>()),
  getJob: (...a: unknown[]) => getJob(...a),
  claimJobDone: (...a: unknown[]) => claimJobDone(...a),
}));
vi.mock("@/lib/db/designs", () => ({
  versionForGeneration: (...a: unknown[]) => versionForGeneration(...a),
  getDesign: (...a: unknown[]) => getDesign(...a),
}));
vi.mock("@/lib/designReadyNotice", () => ({
  notifyDesignReady: (...a: unknown[]) => notifyDesignReady(...a),
}));
vi.mock("@/lib/designAccess", () => ({
  requireDesignAccess: (...a: unknown[]) => requireDesignAccess(...a),
}));

const { GET } = await import("../route");

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

const stuckJob = {
  id: JOB_ID,
  design_id: "d-1",
  run_id: RUN_ID,
  status: "running",
  stage: "saving",
  updated_at: new Date().toISOString(),
  result: null,
  error: null,
} as unknown as GenerationJobRow;

const savedVersion = {
  id: "v-1",
  design_id: "d-1",
  version_no: 1,
  svg: "<svg/>",
  validation_report: { status: "pass" },
  candidates: [],
} as unknown as VersionRow;

// כפי שהוא נקרא *אחרי* שהגרסה נשמרה: השדה כבר מצביע על הגרסה החדשה.
const design = { id: "d-1", profile_id: "p-1", serial: 84, current_version_id: "v-1" } as unknown as DesignRow;

const call = () => GET(new Request("https://x/api/generate/" + JOB_ID), { params: Promise.resolve({ jobId: JOB_ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  getJob.mockResolvedValue(stuckJob);
  versionForGeneration.mockResolvedValue(savedVersion);
  getDesign.mockResolvedValue(design);
  claimJobDone.mockResolvedValue(true);
  requireDesignAccess.mockResolvedValue(design);
});

describe("GET /api/generate/[jobId] — recovery", () => {
  it("returns the recovered result", async () => {
    const body = await (await call()).json();
    expect(body.status).toBe("done");
    expect(body.result.version).toEqual({ id: "v-1", version_no: 1, svg: "<svg/>" });
  });

  /** הטסט של התיקון עצמו: בלי הקריאה ל-notifyDesignReady הוא נופל. */
  it("sends the design-ready mail the dead isolate never sent", async () => {
    await call();
    expect(notifyDesignReady).toHaveBeenCalledOnce();
    expect(notifyDesignReady).toHaveBeenCalledWith(design, true);
  });

  /**
   * העדות ל"גרסה ראשונה" חייבת להיות `version_no`. אילו המסלול היה מסיק אותה
   * מ-`design.current_version_id` — שכבר מלא בשלב הזה — התשובה הייתה `false`
   * תמיד, והמייל היה נחסם בדיוק במסלול שנועד להחזיר אותו.
   */
  it("derives 'first version' from version_no, not from the design row", async () => {
    expect(design.current_version_id).toBeTruthy();
    await call();
    expect(notifyDesignReady).toHaveBeenCalledWith(design, true);
  });

  it("treats a later version as an edit — no mail", async () => {
    versionForGeneration.mockResolvedValue({ ...savedVersion, version_no: 4 });
    await call();
    expect(notifyDesignReady).toHaveBeenCalledWith(design, false);
  });

  /**
   * הלקוחה מושכת כל שנייה וחצי, ולכן שני סקרים יכולים לנחות על אותה גרסה.
   * רק מי שסגר את השורה שולח; השני עדיין מקבל את התוצאה.
   */
  it("does not send twice when another poll already claimed the job", async () => {
    claimJobDone.mockResolvedValue(false);
    const body = await (await call()).json();
    expect(body.status).toBe("done");
    expect(notifyDesignReady).not.toHaveBeenCalled();
  });

  /**
   * ההתראה היא נספח, לא תנאי. אילו כשל בקריאת העיצוב היה עולה מכאן, התאוששות
   * מוצלחת הייתה מוחזרת כ-500 — כלומר "היצירה נכשלה" על עיצוב ששמור אצלנו,
   * בדיוק הכשל שהמסלול הזה נבנה כדי למנוע.
   */
  it("still answers 'done' when the mail path throws", async () => {
    getDesign.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("done");
  });

  it("does not go looking for a version while still rendering", async () => {
    getJob.mockResolvedValue({ ...stuckJob, stage: "rendering" });
    const body = await (await call()).json();
    expect(versionForGeneration).not.toHaveBeenCalled();
    expect(body.status).toBe("running");
  });

  it("leaves a finished job alone — the mail was already sent by the POST", async () => {
    getJob.mockResolvedValue({ ...stuckJob, status: "done", result: { ok: 1 } });
    await call();
    expect(notifyDesignReady).not.toHaveBeenCalled();
    expect(claimJobDone).not.toHaveBeenCalled();
  });
});
