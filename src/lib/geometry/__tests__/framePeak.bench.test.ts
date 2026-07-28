import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { frameCutouts } from "@/lib/vectorizer";
import type { DesignRow } from "@/lib/db/designs";

// ה-isolate נהרג על זיכרון (128MB) בבקשה יחידה, ומסגור מועמד בודד נמדד ב-20-60MB.
// השאלה כאן: כמה מזה נובע מכך שהצינור מחזיק את *כל* המועמדים בבת אחת.
//
// כל מועמד מחזיר גם `normalized` — הגאומטריה המנורמלת, שהיא הכבדה שבשדות.
// הצינור צריך ממנה רק את הזוכה, ו-ingestCutouts ממילא גוזר אותה מחדש. אם
// משחררים אותה מיד, ה-peak אמור לרדת מסך כל המועמדים לגודל של אחד.
//
// הרצה:  FRAME_BENCH_DIR=<dir> NODE_OPTIONS=--expose-gc npx vitest run framePeak

const DIR = process.env.FRAME_BENCH_DIR ?? "";

const design = {
  id: "bench",
  product_type: "bracelet",
  length_mm: 165,
  width_mm: 15,
  thickness_mm: 1.5,
  gap_mm: 25,
} as unknown as DesignRow;

const MB = (n: number) => (n / 1024 / 1024).toFixed(1);

/**
 * הקוד הנמדד סינכרוני, ולכן דגימה בטיימר לא נורית בכלל — היא הייתה מחזירה
 * אפס. מה שכן ניתן למדוד: הערימה מיד בתום הקריאה (הכול שהוקצה ועוד לא נאסף),
 * ואז שוב אחרי איסוף כפוי — מה שבאמת מוחזק. ההפרש בין השניים הוא מה ש-GC יכול
 * לשחרר, וזו בדיוק השאלה: האם שחרור ההפניה מספיק.
 */
function measure(fn: () => unknown): { endMb: string; heldMb: string; ms: number } {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const before = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  const kept = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const end = process.memoryUsage().heapUsed;
  gc?.();
  const held = process.memoryUsage().heapUsed;
  // מחזיקים את התוצאה עד אחרי המדידה, אחרת היא נאספת ומדדנו אפס.
  if (!kept) throw new Error("unreachable");
  return { endMb: MB(end - before), heldMb: MB(held - before), ms };
}

describe("peak while framing a whole generation", () => {
  it("compares holding every candidate against holding only what the screen needs", () => {
    if (!DIR || !fs.existsSync(DIR)) return;
    // ארבעה מועמדים, כמו CANDIDATE_TARGET, מהצפופים שיש.
    const files = fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => ({ f, svg: fs.readFileSync(path.join(DIR, f), "utf8") }))
      .sort((a, b) => b.svg.length - a.svg.length)
      .slice(0, 4);
    if (files.length < 2) return;
    console.log("candidates:", files.map((x) => `${x.f}(${(x.svg.length / 1024).toFixed(0)}KB)`).join(" "));

    const now = measure(() => files.map((x) => frameCutouts(design, x.svg)));
    const lean = measure(() =>
      files.map((x) => {
        const c = frameCutouts(design, x.svg);
        // בדיוק מה שמסך התוצאה מקבל — בלי הגאומטריה המנורמלת.
        return { framedSvg: c.framedSvg, report: c.report, drawnRatio: c.drawnRatio, stretch: c.stretch };
      }),
    );

    console.log(`holding everything : end ${now.endMb}MB  held-after-gc ${now.heldMb}MB  (${now.ms.toFixed(0)}ms)`);
    console.log(`holding only the UI: end ${lean.endMb}MB  held-after-gc ${lean.heldMb}MB  (${lean.ms.toFixed(0)}ms)`);
  });
});
