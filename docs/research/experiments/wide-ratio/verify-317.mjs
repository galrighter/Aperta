// אימות חי: התמונה המקורית של AP-0317 דרך הקופסה הפרוסה.
//
// **למה זה קיים.** התיקון (חסם זרוע הבזייה, #287) אומת מקומית על אותה תמונה
// בדיוק — אבל מקומית. מה שלא נבדק הוא שהקופסה **הפרוסה** מריצה את הקוד הזה.
// הבדיקה כאן שולחת את הפאנל המקורי, בפיקסלים שלו, ל-`/api/vectorize` — שהוא
// המסלול היחיד שמזרים תמונה נתונה לקופסה החיה בלי לייצר תמונה חדשה.
//
// **וזה ההבדל שחשוב.** הרצת יצירה רגילה מייצרת תמונה אחרת בכל פעם, ולכן היא
// לא יכולה להשוות לפני/אחרי. כאן הקלט קבוע: אותם 913×245 פיקסלים שהמודל צייר
// ב-18.8, אלה שהגיעו ללקוחה עם שתי שיניים של 0.74 ו-1.12 מ"מ.
//
// הרצה: ADMIN_TOKEN=… node docs/research/experiments/wide-ratio/verify-317.mjs

import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.ADMIN_TOKEN;
const BASE = process.env.SITE_URL || "https://aperta-designs.com";
if (!TOKEN) { console.error("ADMIN_TOKEN is not set — nothing to run."); process.exit(2); }

const here = path.dirname(new URL(import.meta.url).pathname);
const png = fs.readFileSync(path.join(here, "ap0317-panel.png"));

const login = await fetch(`${BASE}/api/admin/session`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: TOKEN }),
});
if (!login.ok) { console.error(`admin login → HTTP ${login.status}`); process.exit(1); }
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

async function post(pathname, body) {
  const res = await fetch(BASE + pathname, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  if (!res.ok) throw new Error(`${pathname} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// המידות של AP-0317 כפי שהוזמנו. הרוחב (73) הוא מה שהקופסה מקבלת כ-height_mm,
// והאורך נגזר אצלה מהחיתוך — בדיוק כמו בהרצה המקורית.
const dims = { productType: "bracelet", lengthMm: 160.4, widthMm: 73, thicknessMm: 1.5 };
const plan = await post("/api/admin/prompt-lab", { ...dims, userPrompt: "אימות 317" });
const { design } = await post("/api/designs", { ...dims, profileId: plan.profileId, name: "verify-317 live" });

const out = await post("/api/vectorize", {
  designId: design.id,
  colorKey: "auto",
  image: { dataUrl: `data:image/png;base64,${png.toString("base64")}` },
});
console.log(`design ${design.id}`);
console.log(JSON.stringify({ status: out?.report?.status ?? out?.status, version: out?.version?.id }, null, 2));
