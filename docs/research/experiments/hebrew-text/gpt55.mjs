import fs from "node:fs";
const KEY = process.env.OPENAI_KEY;
const MODEL = process.argv[2] || "gpt-5.5";
const OUT = process.argv[3];
const USER = 'שיהיה כתוב "שני מגידס" ומסביב עיטורים';

// הפרומפט הרגיל שלנו, מילה במילה (bracelet), עם טקסט המשתמש כפי שהוא
const prompt = [
  "A flat, top-down, orthographic product image of a laser-cut brass bracelet cuff, laid out perfectly straight and unrolled, filling the full width of the frame edge to edge, on a completely flat pure #FFFFFF white background.",
  "The bracelet is a single long horizontal strip of solid warm-gold brass with an intricate decorative cut-out pattern.",
  "The cut-out openings are fully cut through, showing the same pure white background through them.",
  "Design intent for the cut-out pattern: " + USER + ".",
  "Render the pattern as bold, cleanly separated cut-outs with generous openings and sturdy connecting metal bands. Suitable for laser-cutting in 1.5mm brass. Avoid hair-thin lines, densely packed fine detail, or bands that nearly touch; keep clear space between adjacent openings.",
  "CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO reflection, NO gradient — the background is one uniform flat white with zero shading, and the metal sits flush like a flat vector illustration.",
  "Perfectly even flat lighting, straight overhead orthographic view, no perspective, no bevel, no depth, no hands, no props, no text, no border framing.",
  "High contrast: the brass is a clearly saturated warm gold, distinctly warmer and darker than the pure white, so the metal separates cleanly from the openings.",
].join(" ");

const res = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    input: prompt,
    tools: [{ type: "image_generation", quality: "high", size: "1536x1024" }],
  }),
});
const text = await res.text();
if (!res.ok) { console.log("HTTP", res.status, text.slice(0, 600)); process.exit(1); }
const data = JSON.parse(text);
const imgs = (data.output || []).filter((o) => o.type === "image_generation_call");
const says = (data.output || []).filter((o) => o.type === "message")
  .flatMap((m) => (m.content || []).map((c) => c.text)).join("\n");
if (says) console.log("MODEL SAID:", says.slice(0, 800));
imgs.forEach((im, i) => {
  if (im.result) { fs.writeFileSync(`${OUT}-${i + 1}.png`, Buffer.from(im.result, "base64")); console.log("saved", `${OUT}-${i + 1}.png`); }
  if (im.revised_prompt) console.log("REVISED PROMPT:", String(im.revised_prompt).slice(0, 600));
});
console.log("images:", imgs.length, "| usage:", JSON.stringify(data.usage || {}));
