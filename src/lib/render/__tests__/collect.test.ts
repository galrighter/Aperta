import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { collectRenderJob } from "../service";

// איסוף הרצה מהקופסה **לפי המזהה בלבד**.
//
// זו הנקודה שבלעדיה אי אפשר לסיים הרצה של מישהי אחרת: המזהה שהקופסה מחזיקה
// תחתיו נגזר גם מתוכן הבקשה, ותמונת ההשראה שנשלחה בה אינה נשמרת אצלנו בגודלה.
// כלומר "לשלוח את אותה בקשה שוב" עובד רק למי שהגוף עדיין בידה. כאן ההצבעה
// ישירה — המזהה נשמר בשורת ההרצה, ואיתו נאספת התוצאה.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.VECTORIZER_URL = "https://box.example";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VECTORIZER_URL;
});

const PATHS = ["renders/d/a-0.png"];
const STAGES = { rendered: "runs/a/rendered.png", overlay: "runs/a/overlay.png" };

const DONE = {
  state: "done",
  result: {
    model: "gpt-image-1-mini",
    panels: 3,
    candidates: [{ panel: 0, status: "approved", cutouts_svg: "<svg/>", width_mm: 18 }],
    uploaded_renders: [0],
    uploaded_stages: ["rendered"],
  },
};

describe("collectRenderJob", () => {
  it("asks for the run by its id and returns what the box kept", async () => {
    fetchMock.mockResolvedValueOnce(json(DONE));
    const job = await collectRenderJob("box-1", PATHS, STAGES);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://box.example/api/generate/box-1");
    expect(job?.candidates).toHaveLength(1);
    expect(job?.model).toBe("gpt-image-1-mini");
  });

  it("reports only the files the box actually uploaded", async () => {
    // אותה הבחנה כמו במסלול הרגיל: נתיב שלא נכתב אליו אינו ראיה, והיומן לא
    // אמור להצביע על קובץ שאינו שם.
    fetchMock.mockResolvedValueOnce(json(DONE));
    const job = await collectRenderJob("box-1", PATHS, STAGES);
    expect(job?.renderPaths).toEqual(PATHS);
    expect(job?.stagePaths).toEqual({ rendered: "runs/a/rendered.png" });
  });

  it("returns nothing when the box forgot the run", async () => {
    // הקופסה קמה מחדש, או שהתוקף פג. זו תשובה ולא תקלה: מה ששולם אבד, והקורא
    // הוא זה שיחליט מה עושים.
    fetchMock.mockResolvedValueOnce(json({ detail: "unknown job" }, 404));
    expect(await collectRenderJob("box-1", PATHS, STAGES)).toBeNull();
  });

  it("returns nothing while the run is still going", async () => {
    fetchMock.mockResolvedValueOnce(json({ state: "running" }));
    expect(await collectRenderJob("box-1", PATHS, STAGES)).toBeNull();
  });

  it("surfaces a box that answers with an error", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: { message: "boom" } }, 500));
    await expect(collectRenderJob("box-1", PATHS, STAGES)).rejects.toThrow("boom");
  });

  it("surfaces a box it cannot reach", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(collectRenderJob("box-1", PATHS, STAGES)).rejects.toThrow(/Could not reach/);
  });
});
