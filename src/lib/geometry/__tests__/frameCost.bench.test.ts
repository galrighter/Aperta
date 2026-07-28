import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { frameCutouts } from "@/lib/vectorizer";
import type { DesignRow } from "@/lib/db/designs";

// מדידה, לא בדיקה. ה-isolate נהרג על exceededResources עם 20ms CPU בחציון —
// כלומר לא מעבד אלא זיכרון (128MB, לא ניתן להגדלה), ובבקשה **יחידה**. לכן מה
// שמעניין כאן הוא כמה מסגור מקצה, לא כמה זמן הוא לוקח.
// הקבצים נמשכים מהפרודקשן ידנית ולכן הבדיקה מדלגת כשאין אותם.
//
// הרצה:  FRAME_BENCH_DIR=<dir> NODE_OPTIONS=--expose-gc npx vitest run frameCost

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

/** הקצאה בשיא, לא בסוף: דגימה תכופה בזמן שהעבודה רצה. */
function withPeak<T>(fn: () => T): { out: T; peakMb: string; deltaMb: string; ms: number } {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const before = process.memoryUsage().heapUsed;
  let peak = before;
  const timer = setInterval(() => {
    const u = process.memoryUsage().heapUsed;
    if (u > peak) peak = u;
  }, 1);
  const t0 = process.hrtime.bigint();
  const out = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  clearInterval(timer);
  const after = process.memoryUsage().heapUsed;
  if (after > peak) peak = after;
  return { out, peakMb: MB(peak - before), deltaMb: MB(after - before), ms };
}

describe("frameCutouts allocation", () => {
  it("measures a real candidate", () => {
    if (!DIR || !fs.existsSync(DIR)) return;
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".svg"));
    console.log("file".padEnd(22), "svgKB".padStart(7), "ms".padStart(7), "peakMB".padStart(8), "keptMB".padStart(8));
    for (const f of files) {
      const svg = fs.readFileSync(path.join(DIR, f), "utf8");
      const { peakMb, deltaMb, ms } = withPeak(() => frameCutouts(design, svg));
      console.log(
        f.padEnd(22),
        (svg.length / 1024).toFixed(0).padStart(7),
        ms.toFixed(0).padStart(7),
        peakMb.padStart(8),
        deltaMb.padStart(8),
      );
    }
  });
});
