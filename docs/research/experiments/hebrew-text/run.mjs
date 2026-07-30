// Runner for the Hebrew-name image experiment.
// Wraps every request in the production render prompt (src/lib/llm/imagegen.ts),
// varying only: the design-intent text, the "no text" clause, and an appended
// text directive. Writes PNGs to OUT_DIR.

import fs from "node:fs";
import path from "node:path";

const KEY = process.env.OPENAI_KEY;
const OUT_DIR = process.argv[2];
const PHASE = process.argv[3];            // "1" | "2" | "3"
const REPEATS = Number(process.argv[4] || 1);
const MODEL = process.env.IMAGE_MODEL || "gpt-image-1";

const NAMES = ["היילי", "מישל", "שני מגידס", "ענבל רייטר", "קלאופטרה"];

const LETTER_NAMES = {
  "א": "ALEF", "ב": "BET", "ג": "GIMEL", "ד": "DALET", "ה": "HE", "ו": "VAV",
  "ז": "ZAYIN", "ח": "HET", "ט": "TET", "י": "YOD", "כ": "KAF", "ך": "FINAL KAF",
  "ל": "LAMED", "מ": "MEM", "ם": "FINAL MEM", "נ": "NUN", "ן": "FINAL NUN",
  "ס": "SAMEKH", "ע": "AYIN", "פ": "PE", "ף": "FINAL PE", "צ": "TSADI",
  "ץ": "FINAL TSADI", "ק": "QOF", "ר": "RESH", "ש": "SHIN", "ת": "TAV",
};

// ---- the production prompt, verbatim, with two knobs -----------------------
function buildRenderPrompt(userPrompt, { noTextClause = true, directive = "" } = {}) {
  const piece = {
    object: "a laser-cut brass bracelet cuff, laid out perfectly straight and unrolled",
    strip: "The bracelet is a single long horizontal strip of solid warm-gold brass with an intricate decorative cut-out pattern.",
    scale: "Render the pattern as bold, cleanly separated cut-outs with generous openings and sturdy connecting metal bands.",
  };
  const lastLine = noTextClause
    ? "Perfectly even flat lighting, straight overhead orthographic view, no perspective, no bevel, no depth, no hands, no props, no text, no border framing."
    : "Perfectly even flat lighting, straight overhead orthographic view, no perspective, no bevel, no depth, no hands, no props, no border framing.";
  return [
    `A flat, top-down, orthographic product image of ${piece.object}, filling the full width of the frame edge to edge, on a completely flat pure #FFFFFF white background.`,
    piece.strip,
    "The cut-out openings are fully cut through, showing the same pure white background through them.",
    "Design intent for the cut-out pattern: " + userPrompt + ".",
    ...(directive ? [directive] : []),
    piece.scale + " Suitable for laser-cutting in 1.5mm brass. Avoid hair-thin lines, densely packed fine detail, or bands that nearly touch; keep clear space between adjacent openings.",
    "CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO reflection, NO gradient — the background is one uniform flat white with zero shading, and the metal sits flush like a flat vector illustration.",
    lastLine,
    "High contrast: the brass is a clearly saturated warm gold, distinctly warmer and darker than the pure white, so the metal separates cleanly from the openings.",
  ].join(" ");
}

// ---- phase definitions -----------------------------------------------------
function directiveFor(name, phase) {
  if (phase === "1") return "";
  const base =
    `The bracelet must incorporate the Hebrew word "${name}" as part of the cut-out pattern — ` +
    `the letters themselves are cut out of the brass, integrated into the decorative design. ` +
    `Hebrew is written right-to-left. Render the letters exactly as given; do not invent or substitute letterforms.`;
  if (phase === "2") return base;
  const letters = [...name].filter((c) => c !== " ");
  const spelled = [...name]
    .map((c) => (c === " " ? "SPACE" : `${LETTER_NAMES[c] || "?"} (${c})`))
    .join(", ");
  const cps = [...name]
    .map((c) => (c === " " ? "SPACE" : "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")))
    .join(" ");
  return (
    base +
    ` The word is spelled, in reading order from right to left: ${spelled}.` +
    ` Exactly ${letters.length} Hebrew letters, no more and no fewer. Unicode: ${cps}.` +
    ` Copy each letterform exactly; a wrong or invented letter makes the product unusable.`
  );
}

function userPromptFor(name) {
  return `צמיד עם השם ${name}`;   // what a real customer types
}

// ---- API -------------------------------------------------------------------
async function generate(prompt) {
  const body = { model: MODEL, prompt, n: 1, size: MODEL === "gpt-image-1" ? "1536x1024" : "1792x1024" };
  if (MODEL === "gpt-image-1") body.quality = "high";
  else body.response_format = "b64_json";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image in response: " + text.slice(0, 200));
  return { b64, usage: data.usage ?? null };
}

// ---- main ------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const jobs = [];
for (const name of NAMES) {
  for (let r = 1; r <= REPEATS; r++) jobs.push({ name, r });
}

const log = [];
const results = await Promise.all(
  jobs.map(async ({ name, r }) => {
    const prompt = buildRenderPrompt(userPromptFor(name), {
      noTextClause: PHASE === "1",
      directive: directiveFor(name, PHASE),
    });
    const slug = name.replace(/ /g, "-");
    const file = path.join(OUT_DIR, `p${PHASE}-${slug}-${r}.png`);
    const t0 = Date.now();
    try {
      const { b64, usage } = await generate(prompt);
      fs.writeFileSync(file, Buffer.from(b64, "base64"));
      const rec = { phase: PHASE, name, repeat: r, file, ok: true, ms: Date.now() - t0, usage };
      log.push(rec);
      console.log(`ok   p${PHASE} ${name} #${r} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      return rec;
    } catch (e) {
      const rec = { phase: PHASE, name, repeat: r, ok: false, error: String(e.message).slice(0, 300) };
      log.push(rec);
      console.log(`FAIL p${PHASE} ${name} #${r}: ${rec.error}`);
      return rec;
    }
  }),
);

fs.writeFileSync(
  path.join(OUT_DIR, `p${PHASE}-log.json`),
  JSON.stringify({ model: MODEL, phase: PHASE, promptSample: buildRenderPrompt(userPromptFor(NAMES[0]), { noTextClause: PHASE === "1", directive: directiveFor(NAMES[0], PHASE) }), results: log }, null, 2),
);
console.log(`done: ${results.filter((r) => r.ok).length}/${results.length}`);
