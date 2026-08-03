import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// הכתובות החתומות נחתמות מול Supabase; כאן הן רק צריכות להיות מחרוזות.
vi.mock("@/lib/db/storage", () => ({
  signedUploadUrl: (path: string) => Promise.resolve(`https://upload.test/${path}`),
}));

import { runRenderJob, type RenderJobInput } from "../service";
import { ApiError } from "@/lib/api";

// המסלול המוחזק (docs/C2_RESILIENT_GENERATION.md): הקופסה עונה 202 ומחזיקה את
// ההרצה, וה-Worker סוקר. מה שנשמר כאן הוא ההתנהגות שבזכותה ניתוק כבר לא מוחק
// הרצה ששולמה — ושהתשובה נראית ללקוחות הפונקציה בדיוק כמו קודם.

const JOB = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const input = (over: Partial<RenderJobInput> = {}): RenderJobInput => ({
  prompt: "a bracelet",
  calls: 1,
  rows: 1,
  cols: 1,
  heightMm: 15,
  colorKey: "coverage",
  minHoleMm: 0.6,
  inspiration: null,
  baseSvg: null,
  renderPaths: ["renders/x/0.png"],
  stagePaths: {},
  ...over,
});

const RESULT = {
  model: "gpt-image-1-mini",
  panels: 1,
  candidates: [{ panel: 0, status: "approved", cutouts_svg: "<svg/>", width_mm: 40 }],
  uploaded_renders: [0],
  uploaded_stages: [],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: Array<{ url: string; method: string; body?: unknown }>;

beforeEach(() => {
  calls = [];
  // רק `setTimeout` — כלומר ההמתנה בין סקירות. שעון מדומה מלא מזייף גם את מה
  // ש-undici משתמש בו כדי להזרים גוף תשובה, ואז `resp.text()` נתלה על טיימר
  // שהטסט לא יודע שהוא מחכה לו (נצפה כתלייה אקראית תחת חבילת הטסטים המלאה).
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * מריץ עם שעון מדומה. הסקירה ישנה בין ניסיונות, ואין סיבה לחכות באמת.
 *
 * מקדמים בצעדים ולא ב-`runAllTimersAsync`: ה-timeout של כל קריאה
 * (`AbortSignal.timeout`) הוא בעצמו טיימר, כך ש"עד שלא נשארו טיימרים" לא מגיע
 * לעולם — הוא רק היה מריץ את הביטול ומפיל את הסקירה.
 */
async function withFakeClock<T>(run: () => Promise<T>): Promise<T> {
  let settled = false;
  const promise = run();
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  // מקדמים כל עוד לא הסתיים, ונותנים בין צעד לצעד לזמן ה**אמיתי** לזוז:
  // קריאת גוף התשובה אינה טיימר, וסבב קידום שרץ לפניה מסיים את כל הצעדים
  // בזמן שהקוד עוד לא הספיק לבקש את ההמתנה הראשונה — ואז אין מי שיקדם אותה.
  // זה היה מקור תלייה שהופיע רק כשכל חבילת הטסטים רצה במקביל.
  const until = Date.now() + 3_000;
  while (!settled && Date.now() < until) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(2_000);
  }
  return promise;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return Promise.resolve(handler(url, init));
  });
}

describe("המסלול המוחזק", () => {
  it("שולח מזהה, סוקר עד הסיום, ומחזיר את התוצאה כמו המסלול הישן", async () => {
    let polls = 0;
    stubFetch((url) => {
      if (url.endsWith("/api/generate")) return json({ job_id: "x", state: "running" }, 202);
      polls += 1;
      return polls < 3
        ? json({ job_id: "x", state: "running" }, 202)
        : json({ job_id: "x", state: "done", result: RESULT }, 200);
    });

    const job = await withFakeClock(() => runRenderJob(input({ jobId: JOB })));

    // התוצאה מגיעה פרוסה מתוך `result` — הקורא לא אמור לדעת באיזה מסלול היא באה.
    expect(job.candidates).toEqual([{ panel: 0, status: "approved", cutoutsSvg: "<svg/>", widthMm: 40 }]);
    expect(job.renderPaths).toEqual(["renders/x/0.png"]);
    expect(polls).toBe(3);
    expect(calls[0]!.method).toBe("POST");
    expect((calls[0]!.body as { job_id: string }).job_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("בלי מזהה — הקופסה עונה 200 והתוצאה היא הגוף עצמו", async () => {
    // המסלול הישן נשאר: בחלון הפריסה יש קופסה חדשה מול Worker ישן וההפך.
    stubFetch(() => json(RESULT, 200));
    const job = await withFakeClock(() => runRenderJob(input()));
    expect(job.panels).toBe(1);
    expect(calls).toHaveLength(1);
    expect((calls[0]!.body as { job_id: null }).job_id).toBeNull();
  });

  it("כשל שקרה ברקע מגיע עם הקוד שלו", async () => {
    // תקציב שנגמר חייב להישאר תקציב שנגמר גם כשהוא מתגלה בסקירה: זה מה
    // שמפעיל את מייל ההתראה בנתיב היצירה.
    stubFetch((url) =>
      url.endsWith("/api/generate")
        ? json({ state: "running" }, 202)
        : json({ state: "error", detail: { error_code: "QUOTA_EXHAUSTED", message: "budget" } }, 422),
    );

    await expect(withFakeClock(() => runRenderJob(input({ jobId: JOB })))).rejects.toMatchObject({
      code: "quota_exhausted",
    });
  });

  it("דחיית מסנן תוכן נשארת מובחנת גם דרך הסקירה", async () => {
    // ההבחנה אינה קוסמטית: היא מה שמונע ניסיון שני על כשל דטרמיניסטי.
    stubFetch((url) =>
      url.endsWith("/api/generate")
        ? json({ state: "running" }, 202)
        : json(
            { state: "error", detail: { error_code: "RENDER_FAILED", message: "rejected by the safety system" } },
            422,
          ),
    );

    await expect(withFakeClock(() => runRenderJob(input({ jobId: JOB })))).rejects.toMatchObject({
      code: "content_blocked",
    });
  });

  it("כשל רשת בסקירה אינו כשל של ההרצה", async () => {
    // ההרצה ממשיכה על הקופסה; לוותר כאן פירושו לזרוק עבודה ששולמה בגלל
    // הפרעה של שנייה אחת.
    let polls = 0;
    stubFetch((url) => {
      if (url.endsWith("/api/generate")) return json({ state: "running" }, 202);
      polls += 1;
      if (polls === 1) throw new Error("network");
      return json({ state: "done", result: RESULT }, 200);
    });

    const job = await withFakeClock(() => runRenderJob(input({ jobId: JOB })));
    expect(job.panels).toBe(1);
  });

  it("קופסה שקמה מחדש ואיבדה את ההרצה נאמרת במפורש", async () => {
    // 404 בסקירה אינו "עוד לא מוכן" — אין מה לאסוף, ולהמשיך לסקור פירושו
    // להשאיר את הלקוחה מול ספינר עד ה-timeout.
    stubFetch((url) => (url.endsWith("/api/generate") ? json({ state: "running" }, 202) : json({}, 404)));

    const err = await withFakeClock(() => runRenderJob(input({ jobId: JOB })).catch((e) => e));
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("render_lost");
  });

  it("אותה בקשה מקבלת אותו מזהה, בקשה שהשתנתה לא", async () => {
    // זו הרשת שמונעת מ-jobId ממוחזר להחזיר ללקוחה ציור שלא ביקשה.
    stubFetch(() => json(RESULT, 200));
    await withFakeClock(() => runRenderJob(input({ jobId: JOB })));
    await withFakeClock(() => runRenderJob(input({ jobId: JOB })));
    await withFakeClock(() => runRenderJob(input({ jobId: JOB, prompt: "a ring" })));

    const ids = calls.map((c) => (c.body as { job_id: string }).job_id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });
});
