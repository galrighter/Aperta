// קורא, חותך וכותב PNG — בלי תלות מקומפלת.
//
// האתר רץ על Cloudflare Workers, ולכן sharp ודומיו לא באים בחשבון. מה שכן קיים
// שם הוא CompressionStream/DecompressionStream של הדפדפן, וזה כל מה שדרוש: PNG
// הוא zlib עטוף בצ'אנקים עם CRC. התמיכה כאן מכוונת בדיוק למה שמודל התמונה פולט
// — 8 סיביות לערוץ, בלי interlace — וכל דבר אחר נזרק במפורש במקום להתפרש לא נכון.

export interface RawImage {
  width: number;
  height: number;
  /** RGBA, שורה אחר שורה. */
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** ערוצים לכל colorType נתמך. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  return collect(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate")));
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  return collect(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate")));
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** מפענח PNG ל-RGBA. זורק על כל וריאנט שאינו 8 סיביות ללא interlace. */
export async function decodePng(bytes: Uint8Array): Promise<RawImage> {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error("not a PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0, height = 0, colorType = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;

  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const bitDepth = bytes[pos + 16];
      colorType = bytes[pos + 17];
      const interlace = bytes[pos + 20];
      if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
      if (interlace !== 0) throw new Error("interlaced PNG is not supported");
      if (colorType !== 3 && !CHANNELS[colorType]) throw new Error(`unsupported PNG colour type ${colorType}`);
    } else if (type === "PLTE") {
      palette = body.slice();
    } else if (type === "IDAT") {
      idat.push(body.slice());
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len; // אורך + סוג + גוף + CRC
  }
  if (!width || !height) throw new Error("PNG has no IHDR");

  const merged = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of idat) {
    merged.set(c, at);
    at += c.length;
  }
  const raw = await inflate(merged);
  const channels = colorType === 3 ? 1 : CHANNELS[colorType];
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    line.set(raw.subarray(start + 1, start + 1 + stride));
    unfilter(filter, line, prev, channels);
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (colorType === 3) {
        const p = line[s] * 3;
        if (!palette) throw new Error("indexed PNG without a palette");
        out[d] = palette[p]; out[d + 1] = palette[p + 1]; out[d + 2] = palette[p + 2]; out[d + 3] = 255;
      } else if (channels === 1) {
        out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255;
      } else if (channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1];
      } else {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
        out[d + 3] = channels === 4 ? line[s + 3] : 255;
      }
    }
    prev.set(line);
  }
  return { width, height, data: out };
}

function unfilter(filter: number, line: Uint8Array, prev: Uint8Array, bpp: number): void {
  switch (filter) {
    case 0:
      return;
    case 1:
      for (let i = bpp; i < line.length; i++) line[i] = (line[i] + line[i - bpp]) & 0xff;
      return;
    case 2:
      for (let i = 0; i < line.length; i++) line[i] = (line[i] + prev[i]) & 0xff;
      return;
    case 3:
      for (let i = 0; i < line.length; i++) {
        const left = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pred) & 0xff;
      }
      return;
    default:
      throw new Error(`unknown PNG filter ${filter}`);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** כותב RGBA כ-PNG (colour type 6, פילטר None). */
export async function encodePng(img: RawImage): Promise<Uint8Array> {
  const stride = img.width * 4;
  const raw = new Uint8Array((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, img.width);
  view.setUint32(4, img.height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** חותך מלבן. אזור שחורג מהתמונה נחתך לגבולות שלה. */
export function cropImage(img: RawImage, x: number, y: number, w: number, h: number): RawImage {
  const x0 = Math.max(0, Math.min(img.width, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.height, Math.floor(y)));
  const x1 = Math.max(x0, Math.min(img.width, Math.ceil(x + w)));
  const y1 = Math.max(y0, Math.min(img.height, Math.ceil(y + h)));
  const width = x1 - x0, height = y1 - y0;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y0 + row) * img.width + x0) * 4;
    data.set(img.data.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, data };
}
