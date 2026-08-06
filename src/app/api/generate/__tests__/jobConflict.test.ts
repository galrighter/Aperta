import { describe, expect, it, vi, beforeEach } from "vitest";
import { JobConflictError, type GenerationJobRow } from "@/lib/db/jobs";
import type { DesignRow } from "@/lib/db/designs";

// AP-0090: הלקוחה ראתה "משהו השתבש" (`job_conflict · 409`) על ניסיון חוזר,
// בזמן שהתוצאה ששולמה כבר ישבה בשורת ה-job. המזהה מגיע מהלקוחה והיא ממחזרת
// אותו בכוונה אחרי ניתוק — בדיוק כשהשרת המשיך לרוץ וכתב `done`/`error` עליו.
//
// מה שנבדק כאן הוא ההכרעה בלבד: מתי POST מחזיר את התשובה השמורה במקום להריץ
// שוב, ומתי 409 נשאר 409. הרצה מלאה של הצינור אינה נוגעת בשאלה הזו.

const startJob = vi.fn();
const requireDesignAccess = vi.fn();
const reserveGeneration = vi.fn();
const persistRun = vi.fn();
/** נשמע רק כדי לוודא שהוא **לא** נקרא: שידור חוזר אינו הרצה. */
const runRenderJob = vi.fn();

vi.mock("@/lib/db/jobs", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/jobs")>()),
  startJob: (...a: unknown[]) => startJob(...a),
}));
vi.mock("@/lib/designAccess", () => ({
  requireDesignAccess: (...a: unknown[]) => requireDesignAccess(...a),
}));
vi.mock("@/lib/db/designs", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/designs")>()),
  reserveGeneration: (...a: unknown[]) => reserveGeneration(...a),
}));
vi.mock("@/lib/runs/persist", () => ({ persistRun: (...a: unknown[]) => persistRun(...a) }));
vi.mock("@/lib/render/service", () => ({ runRenderJob: (...a: unknown[]) => runRenderJob(...a) }));

const { POST } = await import("../route");

const DESIGN_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "11111111-1111-4111-8111-111111111111";

const design = {
  id: DESIGN_ID,
  profile_id: "p-1",
  product_type: "bracelet",
  length_mm: 160,
  width_mm: 18,
  thickness_mm: 1.5,
  current_version_id: "v-1",
} as unknown as DesignRow;

const row = (over: Partial<GenerationJobRow>): GenerationJobRow =>
  ({
    id: JOB_ID,
    design_id: DESIGN_ID,
    run_id: "22222222-2222-4222-8222-222222222222",
    status: "running",
    stage: null,
    result: null,
    error: null,
    ...over,
  }) as unknown as GenerationJobRow;

const post = () =>
  POST(
    new Request("https://x/api/generate", {
      method: "POST",
      body: JSON.stringify({ designId: DESIGN_ID, jobId: JOB_ID, userPrompt: "עלים" }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireDesignAccess.mockResolvedValue(design);
  reserveGeneration.mockResolvedValue("ok");
  persistRun.mockResolvedValue(undefined);
});

describe("ניסיון חוזר על job שכבר הסתיים", () => {
  it("מחזיר את התוצאה השמורה במקום להריץ שוב", async () => {
    const result = { runId: "r", version: { id: "v-2" }, candidates: [] };
    startJob.mockRejectedValue(
      new JobConflictError("exists", row({ status: "done", result })),
    );

    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    // זו כל הנקודה: אין קריאה שנייה למודל, ואין שורת יומן שנייה על אותה הרצה.
    expect(runRenderJob).not.toHaveBeenCalled();
    expect(persistRun).not.toHaveBeenCalled();
  });

  it("מחזיר את הכשל המקורי, ולא 'משהו השתבש'", async () => {
    // `content_blocked` יש לו נוסח משלו בלקוחה — "נסחו מחדש" ולא "נסו שוב" —
    // ו-409 הסתיר אותו מאחורי ההודעה הכללית.
    startJob.mockRejectedValue(
      new JobConflictError("exists", row({ status: "error", error: { code: "content_blocked", message: "blocked" } })),
    );

    const res = await post();
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("content_blocked");
    expect(runRenderJob).not.toHaveBeenCalled();
  });

  it("כשל שאין לו סטטוס שמור חוזר כ-500 — אבל עם הקוד שלו", async () => {
    // הקוד הוא מה שמונע מהלקוחה לנסות להתאושש: `mayHaveSurvived` נשען על
    // 5xx **בלי** קוד, כלומר על isolate שנהרג. כאן יש קוד, ולכן אין חיפוש.
    startJob.mockRejectedValue(
      new JobConflictError("exists", row({ status: "error", error: { code: "internal", message: "boom" } })),
    );

    const res = await post();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });

  it("job של עיצוב אחר נשאר 409 — שם ההגנה נחוצה", async () => {
    startJob.mockRejectedValue(
      new JobConflictError("exists", row({
        design_id: "44444444-4444-4444-8444-444444444444",
        status: "done",
        result: { version: { id: "לא שלה" } },
      })),
    );

    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("job_conflict");
  });

  it("שורה שנעלמה נשארת 409 — אין מה לשדר", async () => {
    startJob.mockRejectedValue(new JobConflictError("exists", null));
    const res = await post();
    expect(res.status).toBe(409);
  });

  it("job שהסתיים בלי תוצאה שמורה אינו מזויף להצלחה", async () => {
    // `done` בלי `result` הוא שורה חסרה, לא תשובה. עדיף 409 שאומר "נסו שוב"
    // מאשר 200 ריק שהלקוחה תיפול עליו בקריאת `version`.
    startJob.mockRejectedValue(
      new JobConflictError("exists", row({ status: "done", result: null })),
    );
    const res = await post();
    expect(res.status).toBe(409);
  });
});
