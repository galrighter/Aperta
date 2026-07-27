import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ClientApiError } from "../api";

// היצירה נפתחת כבקשה קצרה וממשיכה ברקע; הלקוחה מושכת את המצב. הערך של זה הוא
// שניתוק באמצע הוא הפסקה במשיכה ולא אובדן — וזה בדיוק מה שנבדק כאן.

const INPUT = { designId: "d1", userPrompt: "leaves", currentSvg: null, images: [] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** מריץ את הפרומיס לצד קידום שעונים, כדי שלולאת המשיכה תתקדם בלי המתנה אמיתית. */
async function withTimers<T>(p: Promise<T>): Promise<T> {
  const settled = p.then(
    (v) => ({ ok: true as const, v }),
    (e) => ({ ok: false as const, e }),
  );
  for (let i = 0; i < 40; i++) {
    await vi.advanceTimersByTimeAsync(1600);
    const done = await Promise.race([settled, Promise.resolve(null)]);
    if (done) return done.ok ? done.v : Promise.reject(done.e);
  }
  return settled.then((r) => (r.ok ? r.v : Promise.reject(r.e)));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const RESULT = { version: { id: "v1" }, report: { status: "pass" }, geometry: null };

describe("generate — start and poll", () => {
  it("returns the result the job reports", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ jobId: "j1", status: "running" }, 202))
      .mockResolvedValueOnce(json({ status: "running", stage: "rendering" }))
      .mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
  });

  it("survives a dropped connection while polling", async () => {
    // זה הלב: הרשת נופלת אחרי שהעבודה כבר רצה. קודם זו הייתה שגיאת יצירה;
    // עכשיו זו רק משיכה שנכשלה, והבאה מוצאת את התוצאה.
    fetchMock
      .mockResolvedValueOnce(json({ jobId: "j1", status: "running" }, 202))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
  });

  it("reports a job failure with its own message, not a generic one", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ jobId: "j1", status: "running" }, 202))
      .mockResolvedValueOnce(json({ status: "error", error: { code: "vectorize_failed" } }));

    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect(err).toBeInstanceOf(ClientApiError);
    expect((err as ClientApiError).code).toBe("vectorize_failed");
  });

  it("stops polling an unknown job instead of spinning to the timeout", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ jobId: "j1", status: "running" }, 202))
      .mockResolvedValueOnce(json({ error: { code: "not_found" } }, 404));

    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect((err as ClientApiError).status).toBe(404);
  });

  it("reports the stage while the job is still running", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ jobId: "j1", status: "running" }, 202))
      .mockResolvedValueOnce(json({ status: "running", stage: "rendering" }))
      .mockResolvedValueOnce(json({ status: "running", stage: "saving" }))
      .mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    const stages: Array<string | null> = [];
    await withTimers(api.generate(INPUT, (s) => stages.push(s)));
    expect(stages).toEqual(["rendering", "saving", null]);
  });
});

describe("generate — the deploy window", () => {
  it("accepts a result returned inline, with no job to poll", async () => {
    // המסלול הרגיל: השרת מריץ בתוך הבקשה ומחזיר את התוצאה עצמה.
    fetchMock.mockResolvedValueOnce(json(RESULT));
    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("generate — a connection that drops mid-request", () => {
  it("asks about the job it named instead of giving up", async () => {
    // הבקשה עצמה נופלת, לא המשיכה. המזהה נוצר בלקוחה לפני השליחה, ולכן יש את מי
    // לשאול; בלעדיו הרצה שהסתיימה בשרת הייתה נראית כאובדן.
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
    const [, pollUrl] = fetchMock.mock.calls.map((c) => String(c[0]));
    const sentJobId = JSON.parse(String(fetchMock.mock.calls[0][1].body)).jobId;
    expect(pollUrl).toBe(`/api/generate/${sentJobId}`);
  });

  it("does not poll when the server answered with a real error", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "rate_limited" } }, 429));
    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect((err as ClientApiError).code).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
