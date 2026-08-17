// A/B על החיתוך בקצה — הפרומפט שהיה מול הפרומפט שיש, דרך הצינור האמיתי.
//
// **מה נמדד.** AP-0250 (צמיד 160.4×73, יחס מוזמן 2.2) חזר עם מתכת על הגבול
// השמאלי של הקנבס, וגם הניסיון החוזר של הקופסה נחתך — ולכן הקופסה שמרה את
// המקורי והלקוחה קיבלה פריט שקצהו נחתך על ידי המסגרת. השאלה כאן היא אם הנוסח
// שהוחלף ב-PR #271 מחזיר את זה, ותשובה לה דורשת חזרות: הרצה בודדת לכל צד לא
// מוכיחה כלום לשום כיוון.
//
// **שני הצדדים אינם מנוסחים כאן.** `prompt-old.txt` הוא ה-`render_prompt` של
// ההרצה שנחתכה, מילה במילה — הוא שוחזר מהקוד שלפני המיזוג ואומת מול הרשומה
// (`md5(render_prompt)` = 8970f6153825b5975678c2c4764f589a). `prompt-new.txt`
// הוא מה ש-`buildRenderPrompt` מייצר היום לאותם קלטים בדיוק. כלומר אין כאן
// ניסוח שלישי שאפשר לטעות בו.
//
// **למה דרך האתר ולא ישירות מול OpenAI.** כך ההרצה נכנסת ליומן על כל השדות —
// `drawnRatio`, `stretch`, ושלב `edges` שהקופסה מחשבת על הרנדר המלא לפני כל
// קרופ — במקום להשאיר PNG שצריך לנתח בצד. זה גם המסלול שהקנרית עוברת בו
// (`.github/workflows/canary.yml`), על אותו פרופיל בודק ואותה מכסה.
//
// הרצה: ADMIN_TOKEN=… node docs/research/experiments/wide-ratio/run.mjs [repeats=5]

import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.ADMIN_TOKEN;
const BASE = process.env.SITE_URL || "https://aperta-designs.com";
const REPEATS = Number(process.argv[2] || 5);

/** המידות והבריף של AP-0250, כפי שהם ברשומת ההרצה. */
const DIMS = { productType: "bracelet", lengthMm: 160.4, widthMm: 73, thicknessMm: 1.5 };
const BRIEF =
  "עיצוב צמיד פתוח שנחתך בלייזר מפח מתכת שטוח. א-סימטרי, צפיפות נמוכה — מעט חיתוכים, הרבה מתכת, תחושה עדינה ודקה. " +
  "תיאור הלקוחה: פסי מתכת עדינים הנראים כקורי עכביש עדינים ויוצרים צמיד ללא מסגרת נפרדת, רק קורים";

if (!TOKEN) {
  console.error("ADMIN_TOKEN is not set — nothing to run.");
  process.exit(2);
}

const here = path.dirname(new URL(import.meta.url).pathname);
const PROMPTS = Object.fromEntries(
  ["old", "new"].map((n) => [n, fs.readFileSync(path.join(here, `prompt-${n}.txt`), "utf8").trim()]),
);

// כניסה כמו הקנרית — דרך `/api/admin/session`, ולא בהרכבת העוגייה ביד. אותה
// עוגייה בדיוק, אבל מהדלת שהאתר עצמו פותח.
let cookie = "";
{
  const res = await fetch(`${BASE}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: TOKEN }),
  });
  if (!res.ok) {
    console.error(`admin login → HTTP ${res.status}`);
    process.exit(1);
  }
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function post(pathname, body) {
  const res = await fetch(BASE + pathname, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  if (!res.ok) throw new Error(`${pathname} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const plan = await post("/api/admin/prompt-lab", { ...DIMS, userPrompt: BRIEF });
console.log(`profile=${plan.profileName} plannedRows=${plan.plannedRows} rows=${plan.rows}`);

const out = [];
// לסירוגין ישן/חדש ולא בשני גושים: אם משהו בצד השני זז באמצע (עומס, גרסת
// מודל), הוא זז על שני הצדדים במידה שווה ולא על אחד מהם.
for (let i = 1; i <= REPEATS; i++) {
  for (const variant of ["old", "new"]) {
    const started = Date.now();
    const name = `edge-ab ${variant} ${i}`;
    try {
      const { design } = await post("/api/designs", { ...DIMS, profileId: plan.profileId, name });
      await post("/api/generate", {
        designId: design.id,
        userPrompt: BRIEF,
        promptOverride: PROMPTS[variant],
        rowsOverride: plan.rows,
      });
      out.push({ variant, i, name, designId: design.id, ms: Date.now() - started });
      console.log(`${variant} ${i}/${REPEATS} design=${design.id} ${Date.now() - started}ms`);
    } catch (e) {
      // כשל של קריאה אחת אינו כשל של המדידה — הוא מוציא את עצמו מהמכנה, וזה
      // מה שהיומן כאן קיים בשבילו.
      out.push({ variant, i, name, error: String(e.message ?? e) });
      console.error(`${variant} ${i}/${REPEATS} failed: ${e.message ?? e}`);
    }
  }
}

// העיצובים **אינם** נמחקים, בניגוד לקנרית: מחיקה מאפסת את `design_id` ברשומת
// ההרצה, ואז אי אפשר להצמיד הרצה לצד שלה בניסוי. הם יושבים על פרופיל הבודק.
console.log(`\ndone — ${out.filter((o) => !o.error).length}/${out.length} runs`);
console.log(JSON.stringify(out, null, 2));
