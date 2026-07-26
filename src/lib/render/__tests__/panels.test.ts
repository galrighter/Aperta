import { describe, expect, it } from "vitest";
import { decodePng, encodePng, type RawImage } from "../png";
import { findBands, planRender, splitRender } from "../panels";

/** תמונה לבנה עם N פסים כהים — מדמה את פריסת השורות שהמודל מחזיר. */
function striped(rows: number, opts?: { shadow?: boolean }): RawImage {
  const width = 300, height = 200;
  const data = new Uint8Array(width * height * 4).fill(255);
  const slot = Math.floor(height / rows);
  const bar = Math.floor(slot * 0.5);
  for (let r = 0; r < rows; r++) {
    const y0 = r * slot + Math.floor((slot - bar) / 2);
    for (let y = y0; y < y0 + bar; y++) {
      for (let x = 20; x < width - 20; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 17;
      }
    }
    if (opts?.shadow) {
      // צל רך מתחת לפס — בהיר מהסף, ואסור שייספר כפס נוסף
      for (let y = y0 + bar; y < Math.min(height, y0 + bar + 4); y++) {
        for (let x = 20; x < width - 20; x++) {
          const i = (y * width + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 205;
        }
      }
    }
  }
  return { width, height, data };
}

describe("planRender", () => {
  it("uses more rows the longer and thinner the strip is", () => {
    expect(planRender(4, 4).rows).toBe(1);
    expect(planRender(8, 4).rows).toBe(2);
    expect(planRender(16, 4).rows).toBe(6);
  });

  it("never asks for more rows than the model can hold", () => {
    expect(planRender(40, 4).rows).toBe(6);
  });

  it("makes up the candidate count with extra calls when one row is enough", () => {
    const p = planRender(6.4, 4);
    expect(p.rows).toBe(1);
    expect(p.calls).toBe(4);
    expect(p.candidates).toBe(4);
  });

  it("does not spend a second call when the rows already cover the target", () => {
    expect(planRender(16, 4).calls).toBe(1);
  });
});

describe("findBands", () => {
  it("finds one band per drawn strip", async () => {
    for (const rows of [1, 2, 4, 6]) {
      expect(findBands(striped(rows)).length).toBe(rows);
    }
  });

  it("does not count the drop shadow as a strip", () => {
    expect(findBands(striped(3, { shadow: true })).length).toBe(3);
  });
});

describe("splitRender", () => {
  it("returns one readable PNG per strip", async () => {
    const parts = await splitRender(await encodePng(striped(4)));
    expect(parts.length).toBe(4);
    for (const p of parts) {
      const img = await decodePng(p);
      expect(img.width).toBe(300);
      expect(findBands(img).length).toBe(1);
    }
  });

  it("hands back the original file when there is nothing to split", async () => {
    const bytes = await encodePng(striped(1));
    expect(await splitRender(bytes)).toEqual([bytes]);
  });
});
