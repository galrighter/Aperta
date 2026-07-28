import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { frameCutouts } from "@/lib/vectorizer";
import type { DesignRow } from "@/lib/db/designs";

// מדידה, לא בדיקה: כמה CPU עולה מסגור + ולידציה של מועמד אחד. הצינור עושה את
// זה לכל מועמד בתוך אותה בקשה, על isolate של Cloudflare עם תקרת CPU קשיחה.
// הקבצים נמשכים מהפרודקשן ידנית ולכן הבדיקה מדלגת כשאין אותם.

const DIR = process.env.FRAME_BENCH_DIR ?? "";

const design = {
  id: "bench",
  product_type: "bracelet",
  length_mm: 165,
  width_mm: 15,
  thickness_mm: 1.5,
  gap_mm: 25,
} as unknown as DesignRow;

describe("frameCutouts cost", () => {
  it("times a real candidate", () => {
    if (!DIR || !fs.existsSync(DIR)) return;
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".svg"));
    for (const f of files) {
      const svg = fs.readFileSync(path.join(DIR, f), "utf8");
      const t0 = process.hrtime.bigint();
      const out = frameCutouts(design, svg);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      console.log(`${f}  ${svg.length}B  ->  ${ms.toFixed(0)}ms  status=${out.report.status}`);
    }
  });
});
