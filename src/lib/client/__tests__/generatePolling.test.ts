import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ClientApiError } from "../api";
import { he } from "@/i18n/he";

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

describe("generate — the isolate died holding the answer", () => {
  it("recovers the result behind a bodyless 503", async () => {
    // Cloudflare הורג את ה-isolate *אחרי* שהצינור סיים; הסגירה כבר נכתבה,
    // אז התוצאה קיימת — רק המשלוח לא שרד. לזרוק כאן מוחק יצירה שהצליחה.
    fetchMock
      .mockResolvedValueOnce(new Response("error code: 1102", { status: 503 }))
      .mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
  });

  it("recovers a result whose 200 body was cut off", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{\"version\":", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
  });

  it("reports the original failure when there is no result to recover", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("error code: 1102", { status: 503 }))
      .mockResolvedValueOnce(json({ error: { code: "not_found" } }, 404));

    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect((err as ClientApiError).status).toBe(503);
  });

  it("does not go looking after a real server rejection", async () => {
    // 4xx עם קוד הוא פסק דין של הקוד שלנו, לא isolate שמת.
    fetchMock.mockResolvedValueOnce(json({ error: { code: "rate_limited" } }, 429));

    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect((err as ClientApiError).code).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  /* AP-0090: ההמתנה אחרי ניתוק הייתה 12 שניות, וההרצה לוקחת 30–90. הלקוחה
     ויתרה באמצע וקיבלה "היצירה נכשלה" על הרצה שהצליחה. */

  it("waits for the run to finish instead of giving up after a few seconds", async () => {
    // עשרים משיכות של `running` — הרבה מעבר לחלון הישן — ואז התוצאה.
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    for (let i = 0; i < 20; i++) fetchMock.mockResolvedValueOnce(json({ status: "running", stage: "rendering" }));
    fetchMock.mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
  });

  it("says it is disconnected, so the screen is not a silent spinner", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ status: "running", stage: "rendering" }))
      .mockResolvedValueOnce(json({ status: "done", result: RESULT }));

    const stages: Array<string | null> = [];
    await withTimers(api.generate(INPUT, (s) => stages.push(s)));
    // ראשון — כי הוא נכתב לפני המשיכה הראשונה; ואז מצב השרת חוזר להיות המקור,
    // כי אם המשיכה הצליחה החיבור חזר.
    expect(stages).toEqual(["disconnected", "rendering", null]);
  });

  it("prefers the job's verdict over the disconnection that preceded it", async () => {
    // הניתוק הוא איך שאיבדנו את החוט; דחיית הווקטורייזר היא מה שבאמת קרה.
    // עד כאן הוצגה השגיאה המוקדמת יותר, שהיא הפחות נכונה מהשתיים.
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ status: "error", error: { code: "vectorize_failed" } }));

    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect((err as ClientApiError).code).toBe("vectorize_failed");
  });

  it("surfaces a stalled run as itself, not as a network error", async () => {
    // ה-isolate מת בלי לכתוב כלום; השרת מכריז על השורה כתקועה. זה המסלול
    // שהחלון הקצר הסתיר — הוא החזיר "אובדן תקשורת" לפני שהשרת הספיק להכריע.
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ status: "error", error: { code: "job_stalled" } }));

    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect((err as ClientApiError).code).toBe("job_stalled");
    expect((err as ClientApiError).message).not.toBe(he.errNetwork);
  });
});

/* ===== עיצוב 165 (14.8): בקשה שלא חוזרת **ולא נכשלת** =====

   כל הבדיקות שלמעלה נשענות על כך שהבקשה *נדחית* — `TypeError`, 503, גוף
   קטוע — וכל אחת מהן מפעילה את מסלול ההתאוששות. מה שאין להן כיסוי הוא
   `fetch` שפשוט אינו נפתר: isolate שנהרג באמצע שליחת התשובה, proxy ששותק,
   סוקט של לשונית שמת ברקע. אז אף `catch` לא רץ, ומסך ההמתנה נשאר מסתובב על
   הרצה שהסתיימה, נשמרה, ואפילו שלחה את מייל "העיצוב שלך מוכן".

   מכאן השורה נצפית **במקביל** לבקשה, ולא רק אחריה. */

/** נתב לפי כתובת ולא לפי סדר: הבקשה והמשמר רצים בו-זמנית. */
function route(post: () => Promise<Response>, states: Response[]) {
  return (url: unknown) =>
    String(url) === "/api/generate"
      ? post()
      : Promise.resolve(states.shift() ?? json({ status: "running" }));
}

describe("generate — a request that never comes back", () => {
  it("takes the answer from the job row while the request still hangs", async () => {
    fetchMock.mockImplementation(
      route(() => new Promise<Response>(() => {}), [
        json({ status: "running", stage: "rendering" }),
        json({ status: "running", stage: "saving" }),
        json({ status: "done", result: RESULT }),
      ]),
    );

    const stages: Array<string | null> = [];
    await expect(withTimers(api.generate(INPUT, (s) => stages.push(s)))).resolves.toMatchObject({
      version: { id: "v1" },
    });
    // ובדרך המסך קיבל את שלב ההרצה האמיתי — במסלול התקין `onStage` לא נקרא
    // עד כה אפילו פעם אחת.
    expect(stages).toEqual(["rendering", "saving", null]);
  });

  it("treats a row that is not there yet as timing, not as a missing job", async () => {
    // הסקר הראשון של המשמר יכול להקדים את `startJob`. ויתור על 404 שם היה
    // מכבה את המשמר שנייה וחצי אחרי שהתחיל, כלומר תמיד.
    fetchMock.mockImplementation(
      route(() => new Promise<Response>(() => {}), [
        json({ error: { code: "not_found" } }, 404),
        json({ status: "done", result: RESULT }),
      ]),
    );

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
  });

  it("still prefers the original error when the request failed and there is no row", async () => {
    // אחרי שהבקשה ענתה, 404 חוזר להיות תשובה: אין שורה כי הבקשה לא הגיעה.
    fetchMock.mockImplementation(
      route(() => Promise.resolve(new Response("error code: 1102", { status: 503 })), [
        json({ error: { code: "not_found" } }, 404),
      ]),
    );

    const err = await withTimers(api.generate(INPUT)).catch((e) => e);
    expect((err as ClientApiError).status).toBe(503);
  });

  it("stops watching the row once the request answered", async () => {
    // הצלחה במסלול התקין מכבה את המשמר. בלעדי זה הרצה שנגמרה בדקה השנייה
    // הייתה משאירה סקר פתוח עוד שבע דקות.
    fetchMock.mockImplementation(route(() => Promise.resolve(json(RESULT)), []));

    await expect(withTimers(api.generate(INPUT))).resolves.toMatchObject({ version: { id: "v1" } });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]) !== "/api/generate")).toHaveLength(0);
  });
});
