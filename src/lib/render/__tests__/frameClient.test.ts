import { afterEach, describe, expect, it, vi } from "vitest";

// אין הקשר Cloudflare תחת vitest, וב-ESM אי אפשר לרגל על ייצוא. השער הזה נותן
// לטסט להחליט אם יש binding — כולל את מצב ברירת המחדל, שבו getCloudflareContext
// זורק בדיוק כמו בפועל.
const cf = vi.hoisted(() => ({ env: null as Record<string, unknown> | null }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!cf.env) throw new Error("no cloudflare context");
    return { env: cf.env };
  },
}));

import { frameCandidates } from "../frameClient";
import { framePreview } from "@/lib/geometry/frameCutouts";
import type { DesignDims } from "@/lib/geometry/validate";
import worker from "../../../../workers/frame/index";
import { handleFrame, type FrameRequest } from "../../../../geometry-service/handler";
import type { LetterBridge } from "@/lib/geometry/restoreBridges";
import { difference, rectPolygon } from "@/lib/geometry/poly";

const dims: DesignDims = { productType: "bracelet", lengthMm: 40, widthMm: 8, thicknessMm: 1 };

// פס עם שני חורים מלבניים — מספיק כדי שהוולידציה תרוץ באמת ולא על SVG ריק.
const svg = (vb: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g id="cutouts" fill="black">` +
  `<path d="M4 2L10 2L10 6L4 6Z"/><path d="M14 2L20 2L20 6L14 6Z"/></g></svg>`;

// פס עם חיתוך מלבני שבתוכו אי מתכת, והגשר שנחתך כדי ליצור אותו — הזוג שבלעדיו
// אי אפשר להבדיל בין "הגשר עבר" ל"הגשר נזרק בדרך".
const islandDims: DesignDims = { productType: "bracelet", lengthMm: 40, widthMm: 10, thicknessMm: 1 };
const islandSvg = (() => {
  const rings = difference([rectPolygon(10, 3, 20, 7)], [rectPolygon(13, 4.5, 15, 5.5)]);
  const paths = rings
    .map((p) => `<path d="${p.map((r) => `M${r.map((q) => q.join(" ")).join("L")}Z`).join("")}" fill="black"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><g id="cutouts">${paths}</g></svg>`;
})();
const plan = {
  letterBridges: [{ char: "e", counter: [13, 4.5, 15, 5.5], rects: [[13.6, 2.5, 14.4, 5]], widthMm: 0.8 }] as LetterBridge[],
};

afterEach(() => {
  cf.env = null;
  delete process.env.VECTORIZER_URL;
  delete process.env.VECTORIZER_TOKEN;
});

const post = (body: unknown) =>
  worker.fetch(new Request("https://frame.internal/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

describe("frameCandidates", () => {
  it("frames locally when there is no binding, and never returns the polygon graph", async () => {
    // בלי הקשר Cloudflare (טסטים, next dev) אין binding. יצירה עדיין חייבת לעבוד.
    const out = await frameCandidates(dims, [svg("0 0 44 8"), svg("0 0 40 9")]);
    expect(out).toHaveLength(2);
    for (const c of out) {
      expect(c.framedSvg).toContain("<svg");
      expect(c.report.status).toBeDefined();
      // זו כל הסיבה שהמסגור עבר Worker: הגרף לא חוצה את הגבול ולא נשאר כאן.
      expect(c).not.toHaveProperty("normalized");
    }
  });

  it("matches what local framing would have produced", async () => {
    const [got] = await frameCandidates(dims, [svg("0 0 44 8")]);
    expect(got).toEqual(framePreview(dims, svg("0 0 44 8")));
  });
});

describe("the framing worker", () => {
  it("returns the same preview the local path would", async () => {
    const resp = await post({ dims, cutoutsSvg: svg("0 0 44 8") });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual(JSON.parse(JSON.stringify(framePreview(dims, svg("0 0 44 8")))));
  });

  it("rejects anything it cannot frame instead of guessing", async () => {
    expect((await worker.fetch(new Request("https://frame.internal/"))).status).toBe(405);
    expect((await post({ dims })).status).toBe(400);
    expect((await post({ cutoutsSvg: svg("0 0 44 8") })).status).toBe(400);
  });

  it("answers 500 on a broken SVG so the caller can fall back", async () => {
    // קשת — rescaleCutoutsSvg מסרב לה במפורש. השירות לא קורס, הוא מדווח.
    const arc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 4"><g id="cutouts">` +
      `<path d="M0 0A5 5 0 0 1 10 4Z"/></g></svg>`;
    const resp = await post({ dims, cutoutsSvg: arc });
    expect(resp.status).toBe(500);
    expect((await resp.json() as { error: string }).error).toMatch(/frame failed/);
  });
});

describe("the box comes first", () => {
  // ה-fetch מחובר ל-handler האמיתי של השירות, בדיוק כמו ש-binding מחובר
  // ל-Worker האמיתי למטה. מוק שממסגר בעצמו בודק את המוק: כשהחתימה קיבלה
  // `plan`, מוק כזה עבר בירוק בזמן שהשירות בייצור זרק את הגשרים.
  const boxOk = () =>
    vi.fn(async (_url: string, init?: RequestInit) => {
      const answer = handleFrame(JSON.parse(String(init?.body)) as FrameRequest);
      return Response.json(answer.body, { status: answer.status });
    });

  it("uses the geometry service and never touches the worker", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(boxOk() as typeof fetch);
    const workerCall = vi.fn();
    cf.env = { FRAME: { fetch: workerCall } };
    process.env.VECTORIZER_URL = "https://vec.example.com";

    const out = await frameCandidates(dims, [svg("0 0 44 8")]);
    expect(out[0]).toEqual(JSON.parse(JSON.stringify(framePreview(dims, svg("0 0 44 8")))));
    expect(fetchSpy.mock.calls[0][0]).toBe("https://vec.example.com/api/frame");
    expect(workerCall).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("carries the bridge plan across the hop, so a counter is bridged and not deleted", async () => {
    // חלל אות עם אי מתכת בתוכו — הצורה שאחריה מחליטים לגשר או למחוק. עם
    // ה-plan האי מגושר איפה שחתכנו אותו; בלעדיו הוא אי בעיטור, ומטופל אחרת.
    // הבדיקה הראשונה היא ש-plan בכלל משנה כאן, אחרת השאר לא בודק כלום.
    const withPlan = framePreview(islandDims, islandSvg, plan);
    const withoutPlan = framePreview(islandDims, islandSvg, {});
    expect(withPlan).not.toEqual(withoutPlan);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(boxOk() as typeof fetch);
    process.env.VECTORIZER_URL = "https://vec.example.com";

    const out = await frameCandidates(islandDims, [islandSvg], plan);
    expect(out[0]).toEqual(JSON.parse(JSON.stringify(withPlan)));
    // ומה שנשלח בגוף, לא רק מה שחזר: השירות לא יכול לגשר לפי מה שלא קיבל.
    expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      plan: { letterBridges: [{ char: "e" }] },
    });

    fetchSpy.mockRestore();
  });

  it("carries the bearer the rest of the box expects", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(boxOk() as typeof fetch);
    process.env.VECTORIZER_URL = "https://vec.example.com";
    process.env.VECTORIZER_TOKEN = "s3cret";

    await frameCandidates(dims, [svg("0 0 44 8")]);
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer s3cret");

    fetchSpy.mockRestore();
  });

  it("falls through box → worker → local, saying so each time", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("down", { status: 502 }));
    cf.env = { FRAME: { fetch: async () => new Response("boom", { status: 500 }) } };
    process.env.VECTORIZER_URL = "https://vec.example.com";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await frameCandidates(dims, [svg("0 0 44 8")]);
    expect(out[0]).toEqual(framePreview(dims, svg("0 0 44 8")));
    // שתי הנפילות חייבות להישמע, לא רק האחרונה.
    expect(err).toHaveBeenCalledWith(expect.stringContaining("geometry service failed"), expect.any(String));
    expect(err).toHaveBeenCalledWith(expect.stringContaining("frame worker failed"), expect.any(String));

    fetchSpy.mockRestore();
    err.mockRestore();
  });
});

describe("with a binding", () => {
  it("goes through the worker and returns what it answered", async () => {
    // ה-binding מחובר ישירות ל-handler האמיתי — זה המסלול המלא: JSON החוצה,
    // מסגור שם, JSON חזרה.
    cf.env = { FRAME: { fetch: (input: string, init?: RequestInit) => worker.fetch(new Request(input, init)) } };
    const out = await frameCandidates(dims, [svg("0 0 44 8"), svg("0 0 40 9")]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(JSON.parse(JSON.stringify(framePreview(dims, svg("0 0 44 8")))));
    expect(out[0]).not.toHaveProperty("normalized");
  });

  it("frames locally when the worker errors, rather than failing the generation", async () => {
    cf.env = { FRAME: { fetch: async () => new Response("boom", { status: 500 }) } };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await frameCandidates(dims, [svg("0 0 44 8")]);
    expect(out[0]).toEqual(framePreview(dims, svg("0 0 44 8")));
    // הנפילה חייבת להישמע: מסלול ישן שקט נראה בדיוק כמו תיקון שעובד.
    expect(err).toHaveBeenCalledWith(expect.stringContaining("frame worker failed"), expect.any(String));
    err.mockRestore();
  });
});
