import { describe, expect, it, vi, beforeEach } from "vitest";
import type { JobContext } from "../complete";

/**
 * סיום הרצה **בלי הבקשה שפתחה אותה** — במסלול Story.
 *
 * מה שנבדק כאן הוא שההשלמה המנותקת מקבלת את אותן שתי החלטות של המסלול החי:
 * המסגור הוא קנה מידה אחיד למידות של כל מועמד בעצמו, והרוחב שנגזר נשמר על
 * הרשומה. עד 15.8 היא לא ידעה על המסלול בכלל — ולכן AP-0170 קיבל, שמונה
 * דקות אחרי שהבקשה מתה, גרסה שנמתחה אופקית אל הרוחב שהוזמן.
 *
 * ולצדן ההחלטה השלישית: הרצה שהלקוחה כבר נטשה לטובת אחת מאוחרת יותר אינה
 * נשמרת כלל, כי גרסה נוספת שם אינה הצלה אלא דריסה של מה שהיא בחרה.
 */

const collectRenderJob = vi.fn();
const runRenderJob = vi.fn();
const frameCandidates = vi.fn();
const ingestCutouts = vi.fn();
const persistRun = vi.fn();
const getDesign = vi.fn();
const createSampleDesign = vi.fn();
const updateDesignWidth = vi.fn();
const claimJobDone = vi.fn();
const hasNewerFinishedJob = vi.fn();
const notifyDesignReady = vi.fn();
const signedUrl = vi.fn();

vi.mock("@/lib/render/service", () => ({
  collectRenderJob: (...a: unknown[]) => collectRenderJob(...a),
  runRenderJob: (...a: unknown[]) => runRenderJob(...a),
}));
vi.mock("@/lib/render/frameClient", () => ({
  frameCandidates: (...a: unknown[]) => frameCandidates(...a),
}));
vi.mock("@/lib/vectorizer", async (orig) => ({
  ...(await orig<typeof import("@/lib/vectorizer")>()),
  ingestCutouts: (...a: unknown[]) => ingestCutouts(...a),
}));
vi.mock("@/lib/runs/persist", () => ({ persistRun: (...a: unknown[]) => persistRun(...a) }));
vi.mock("@/lib/db/designs", () => ({
  getDesign: (...a: unknown[]) => getDesign(...a),
  createSampleDesign: (...a: unknown[]) => createSampleDesign(...a),
  updateDesignWidth: (...a: unknown[]) => updateDesignWidth(...a),
}));
vi.mock("@/lib/db/jobs", () => ({
  claimJobDone: (...a: unknown[]) => claimJobDone(...a),
  hasNewerFinishedJob: (...a: unknown[]) => hasNewerFinishedJob(...a),
}));
vi.mock("@/lib/designReadyNotice", () => ({
  notifyDesignReady: (...a: unknown[]) => notifyDesignReady(...a),
}));
vi.mock("@/lib/db/storage", () => ({ signedUrl: (...a: unknown[]) => signedUrl(...a) }));

const { completeFromContext } = await import("../complete");

/** צמיד בברירת המחדל: 160.4 מ"מ אורך, 18 רוחב — הרוחב שעדיין לא נגזר. */
const DESIGN = {
  id: "d-1",
  product_type: "bracelet",
  length_mm: "160.4",
  width_mm: "18",
  thickness_mm: "1.5",
  serial: 170,
  root_serial: null,
  sample_no: null,
  current_version_id: null,
};

/** cutouts SVG במסגרת שה-vectorizer מסר: `height_mm` הוא הרוחב שהוזמן. */
const panel = (lengthMm: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lengthMm} 18">` +
  `<g id="cutouts"><path d="M10 8 L16 8 L16 10 L10 10 Z" fill="black"/></g></svg>`;

const ctx = (over: Partial<JobContext> = {}): JobContext =>
  ({
    boxJobId: "b-1",
    attemptId: "a-1",
    designId: "d-1",
    renderPaths: ["renders/d-1/a-1-0.png"],
    stagePaths: {},
    userPrompt: "סיפור",
    renderPrompt: "prompt",
    inputs: { mode: "story", rows: 3, cols: 1, offeredPanels: 3, widthMm: 18, lengthMm: 160.4 },
    bridges: [],
    tightShare: null,
    startedAt: 1_700_000_000_000,
    ...over,
  }) as unknown as JobContext;

beforeEach(() => {
  vi.clearAllMocks();
  getDesign.mockResolvedValue(DESIGN);
  hasNewerFinishedJob.mockResolvedValue(false);
  persistRun.mockResolvedValue(undefined);
  updateDesignWidth.mockResolvedValue(undefined);
  claimJobDone.mockResolvedValue(true);
  signedUrl.mockResolvedValue(null);
  notifyDesignReady.mockResolvedValue(undefined);
  ingestCutouts.mockResolvedValue({
    version: { id: "v-1", version_no: 1, design_id: "d-1" },
    report: { status: "pass", checks: [] },
    geometry: null,
    lengthMm: 160.4,
    widthMm: 0,
  });
  // המסגור מוחזר במידות שנמסרו לו, כדי שהטסט יוכל לקרוא אותן מה-viewBox.
  frameCandidates.mockImplementation(async (dims: { lengthMm: number; widthMm: number }, svgs: string[]) =>
    svgs.map(() => ({
      framedSvg:
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.lengthMm} ${dims.widthMm}">` +
        `<g id="cutouts"><path d="M10 8 L16 8 L16 10 L10 10 Z" fill="black"/></g></svg>`,
      bridges: [],
      lengthMm: dims.lengthMm,
      widthMm: dims.widthMm,
      drawnRatio: 5,
      stretch: 1,
      report: { status: "pass", checks: [], metrics: { openAreaPct: 10 } },
    })),
  );
  collectRenderJob.mockResolvedValue({
    model: "gpt-image-1-mini",
    raw: { metrics: {} },
    renderPaths: ["renders/d-1/a-1-0.png"],
    stagePaths: {},
    candidates: [
      { status: "approved", cutoutsSvg: panel(102.27) },
      { status: "approved", cutoutsSvg: panel(90.5) },
    ],
  });
});

describe("השלמה מנותקת במסלול Story", () => {
  it("ממסגרת כל מועמד למידות של עצמו — קנה מידה אחיד, לא מתיחה אל הרוחב שהוזמן", async () => {
    const out = await completeFromContext("j-1", "r-1", ctx());
    expect(out.kind).toBe("done");

    // מועמד לכל קריאה, ולכל אחד הרוחב שקנה מידה אחיד מייצר עבורו:
    // 18 × 160.4/102.27 = 28.23, ו-18 × 160.4/90.5 = 31.9.
    const widths = frameCandidates.mock.calls.map((c) => (c[0] as { widthMm: number }).widthMm);
    expect(frameCandidates).toHaveBeenCalledTimes(2);
    expect(widths).toEqual([28.23, 31.9]);
    // ולא הרוחב שהוזמן — זו בדיוק המתיחה שהמסלול קיים כדי למנוע.
    expect(widths).not.toContain(18);
  });

  it("הרוחב שנגזר נשמר על הרשומה, וה-ingest מקבל אותו", async () => {
    await completeFromContext("j-1", "r-1", ctx());
    expect(updateDesignWidth).toHaveBeenCalledWith("d-1", 28.23);
    expect((ingestCutouts.mock.calls[0][0] as { design: { width_mm: number } }).design.width_mm).toBe(28.23);
  });

  it("הרצה שאינה story ממשיכה לקבל מסגור אחד לכל המועמדים, במידות שהוזמנו", async () => {
    await completeFromContext("j-1", "r-1", ctx({ inputs: { rows: 3, cols: 1, offeredPanels: 3 } } as Partial<JobContext>));
    expect(frameCandidates).toHaveBeenCalledTimes(1);
    expect((frameCandidates.mock.calls[0][0] as { widthMm: number }).widthMm).toBe(18);
    expect(updateDesignWidth).not.toHaveBeenCalled();
  });

  it("הרצה שנטשו לטובת מאוחרת יותר אינה נשמרת כלל", async () => {
    hasNewerFinishedJob.mockResolvedValue(true);
    const out = await completeFromContext("j-1", "r-1", ctx());
    expect(out.kind).toBe("superseded");
    // לא נאסף רנדר, לא נכתבה גרסה, ולא יצא מייל.
    expect(collectRenderJob).not.toHaveBeenCalled();
    expect(ingestCutouts).not.toHaveBeenCalled();
    expect(claimJobDone).not.toHaveBeenCalled();
  });

  it("בקשת שינוי אינה נבלמת — היא נשמרת כדוגמה ממוספרת ואינה דורסת דבר", async () => {
    hasNewerFinishedJob.mockResolvedValue(true);
    createSampleDesign.mockResolvedValue({ ...DESIGN, id: "d-2", sample_no: 2 });
    const out = await completeFromContext(
      "j-1",
      "r-1",
      ctx({ inputs: { editedFromCurrent: true, offeredPanels: 3 } } as Partial<JobContext>),
    );
    expect(out.kind).toBe("done");
    expect(hasNewerFinishedJob).not.toHaveBeenCalled();
  });
});
