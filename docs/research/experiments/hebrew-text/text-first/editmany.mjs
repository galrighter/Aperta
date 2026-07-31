import fs from "node:fs";
const KEY = process.env.OPENAI_KEY;
const { out } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const [refPath, model, dir] = process.argv.slice(3);
fs.mkdirSync(dir, { recursive: true });
const ref = fs.readFileSync(refPath);
const res = await Promise.all(out.map(async ({ name, prompt }) => {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", "1536x1024");
  form.append("quality", "low");
  form.append("image", new Blob([ref], { type: "image/png" }), "reference.png");
  const t0 = Date.now();
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { authorization: `Bearer ${KEY}` }, body: form,
  });
  const t = await r.text();
  if (!r.ok) { console.log(`FAIL ${name}: ${r.status} ${t.slice(0, 200)}`); return null; }
  const j = JSON.parse(t);
  fs.writeFileSync(`${dir}/${name}.png`, Buffer.from(j.data[0].b64_json, "base64"));
  console.log(`ok ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  return name;
}));
console.log("done", res.filter(Boolean).length + "/" + out.length);
