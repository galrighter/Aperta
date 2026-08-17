// שלוש קריאות שנחתכו — מורצות שוב, בפרומפט שלהן ובפרומפט של היום.
//
// **מה השאלה.** הפרומפט תוקן ב-#271 ומעולם לא נבדק מול המודל. הבדיקה שרצה עד
// כה הייתה על רנדרים שמורים, וכולם צוירו בנוסח הישן — כלומר היא יכולה לומר
// כמה חתוכים הגיעו לצינור, ולא אם התיקון עוזר.
//
// **הבחירה של שלוש הקריאות אינה שרירותית.** מתוך 27 הרנדרים שנמצאה בהם מתכת על
// גבול הקנבס, אלה שלוש שבהן **גם הניסיון החוזר של הקופסה נחתך** ("retry clipped
// too (left), kept the original") — כלומר המודל נכשל פעמיים ברצף על אותה בקשה,
// והלקוחה קיבלה פריט שקצהו נחתך על ידי המסגרת. אלה המקרים הקשים, ולכן אלה
// שראוי למדוד עליהם:
//
//     AP-0250  160.4×73  יחס 2.2
//     AP-0192  160.4×48  יחס 3.34
//     AP-0131  160.4×41  יחס 3.91
//
// **שני הצדדים אינם מנוסחים כאן.** ה"ישן" הוא ה-`render_prompt` שנשמר ברשומת
// ההרצה, מילה במילה (`cases.json`). ה"חדש" נמשך מ-`/api/admin/prompt-lab`,
// כלומר הוא מה ש-`buildRenderPrompt` הפרוס מייצר **עכשיו** לאותן מידות. אין
// כאן ניסוח שלישי שאפשר לטעות בו, ואין סיכון שהניסוי יבדוק קוד שלא נפרס.
//
// **התוצאה נקראת מהיומן** — `debug.stages[edges]` הוא הבדיקה שהקופסה מריצה על
// הרנדר המלא לפני כל קרופ, ובדיוק היא שתפסה את AP-0250 מלכתחילה.
//
// הרצה: ADMIN_TOKEN=… node docs/research/experiments/wide-ratio/run.mjs [repeats=3]

import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.ADMIN_TOKEN;
const BASE = process.env.SITE_URL || "https://aperta-designs.com";
const REPEATS = Number(process.argv[2] || 3);

if (!TOKEN) {
  console.error("ADMIN_TOKEN is not set — nothing to run.");
  process.exit(2);
}

const here = path.dirname(new URL(import.meta.url).pathname);
const CASES = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8"));

// כניסה כמו הקנרית — דרך `/api/admin/session`, לא בהרכבת העוגייה ביד.
const login = await fetch(`${BASE}/api/admin/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: TOKEN }),
});
if (!login.ok) {
  console.error(`admin login → HTTP ${login.status}`);
  process.exit(1);
}
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

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

const out = [];
for (const c of CASES) {
  const dims = {
    productType: c.productType, lengthMm: c.lengthMm, widthMm: c.widthMm, thicknessMm: c.thicknessMm,
  };
  const plan = await post("/api/admin/prompt-lab", { ...dims, userPrompt: c.userPrompt });

  // שער: אם הפרוס אינו הקוד המתוקן, הניסוי בודק את אותו נוסח פעמיים ואין לו
  // מה לומר. עדיף להיעצר מאשר להחזיר "אין הבדל" שנובע מפריסה ולא מהמודל.
  const fixed = !plan.prompt.includes("long and narrow") && plan.prompt.includes("beyond both of its ends");
  console.log(
    `AP-${String(c.serial).padStart(4, "0")} ${c.lengthMm}×${c.widthMm} יחס ${c.orderedRatio} · ` +
    `rows ${plan.rows} · הפרומפט הפרוס מתוקן: ${fixed}`,
  );
  if (!fixed) {
    console.error("::error::the deployed prompt is not the fixed one — aborting, the A/B would compare a text to itself");
    process.exit(1);
  }

  for (let i = 1; i <= REPEATS; i++) {
    // לסירוגין ולא בשני גושים: אם משהו בצד השני זז באמצע, הוא זז על שני הצדדים.
    for (const [variant, prompt] of [["old", c.originalPrompt], ["new", plan.prompt]]) {
      const started = Date.now();
      const name = `edge-ab AP-${c.serial} ${variant} ${i}`;
      try {
        const { design } = await post("/api/designs", { ...dims, profileId: plan.profileId, name });
        await post("/api/generate", {
          designId: design.id,
          userPrompt: c.userPrompt,
          promptOverride: prompt,
          rowsOverride: plan.rows,
        });
        out.push({ serial: c.serial, variant, i, name, designId: design.id, ms: Date.now() - started });
        console.log(`  ${variant} ${i}/${REPEATS} design=${design.id} ${Date.now() - started}ms`);
      } catch (e) {
        // כשל של קריאה אחת מוציא את עצמו מהמכנה ואינו מפיל את הניסוי.
        out.push({ serial: c.serial, variant, i, name, error: String(e.message ?? e) });
        console.error(`  ${variant} ${i}/${REPEATS} failed: ${e.message ?? e}`);
      }
    }
  }
}

// העיצובים **אינם** נמחקים, בניגוד לקנרית: מחיקה מאפסת את `design_id` ברשומת
// ההרצה, ואז אי אפשר להצמיד הרצה לצד שלה בניסוי.
console.log(`\ndone — ${out.filter((o) => !o.error).length}/${out.length} runs`);
console.log(JSON.stringify(out, null, 2));
