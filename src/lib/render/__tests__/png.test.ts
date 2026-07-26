import { describe, expect, it } from "vitest";
import { cropImage, decodePng, encodePng, type RawImage } from "../png";
import { REAL_PNG_B64 } from "./fixture";

const fromB64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const solid = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): RawImage => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = f(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width: w, height: h, data };
};

const px = (img: RawImage, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

describe("decodePng", () => {
  it("reads a PNG written by another encoder", async () => {
    const img = await decodePng(fromB64(REAL_PNG_B64));
    expect([img.width, img.height]).toEqual([64, 48]);
    // ערכי אמת שנקראו מהקובץ בכלי חיצוני
    expect(px(img, 0, 0)).toEqual([254, 254, 254, 255]);
    expect(px(img, 32, 24)).toEqual([255, 254, 255, 255]);
    expect(px(img, 63, 47)).toEqual([44, 49, 54, 255]);
  });

  it("refuses a file it cannot read rather than returning wrong pixels", async () => {
    await expect(decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow(/not a PNG/);
  });
});

describe("encodePng", () => {
  it("round-trips an image through the encoder and back", async () => {
    const src = solid(37, 11, (x, y) => [x * 7 % 256, y * 23 % 256, (x + y) % 256, 255]);
    const back = await decodePng(await encodePng(src));
    expect([back.width, back.height]).toEqual([37, 11]);
    expect(Array.from(back.data)).toEqual(Array.from(src.data));
  });

  it("produces a file the decoder recognises as a PNG", async () => {
    const bytes = await encodePng(solid(2, 2, () => [1, 2, 3, 255]));
    expect(Array.from(bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});

describe("cropImage", () => {
  it("takes the requested window", () => {
    const src = solid(10, 10, (x, y) => [x * 10, y * 10, 0, 255]);
    const out = cropImage(src, 3, 4, 2, 2);
    expect([out.width, out.height]).toEqual([2, 2]);
    expect(px(out, 0, 0)).toEqual([30, 40, 0, 255]);
    expect(px(out, 1, 1)).toEqual([40, 50, 0, 255]);
  });

  it("clamps a window that runs past the edge", () => {
    const src = solid(4, 4, () => [9, 9, 9, 255]);
    const out = cropImage(src, 2, 2, 10, 10);
    expect([out.width, out.height]).toEqual([2, 2]);
  });
});
