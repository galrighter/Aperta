// משפט המסגור, נמדד: האם הוא מונע את החיתוך בגבול הקנבס.
//
// **מה השאלה.** מתוך 7 רנדרים שנחתכו בניסוי של 17.8, הסבב השני — שהוא היום
// אותה בקשה בדיוק — הציל 3 ונכשל ב-4. השינוי שנבדק כאן הוא המשפט שנוסף לסבב
// השני (`RETRY_FRAMING` ב-llm/imagegen.ts): הפריט מצויר בכ-80% מרוחב התמונה,
// עם לבן בין כל קצה לבין הגבול.
//
// **הוא נשלח כאן כפרומפט ראשי ולא כסבב שני, בכוונה.** אחרת רוב ההרצות אינן
// מודדות דבר: הסבב השני נקרא רק כשהראשון נחתך, כלומר בכ-35% מהמקרים. השאלה
// שהניסוי עונה עליה היא "האם המשפט הזה מונע חיתוך" — ולא "איך מתנהג המנגנון
// המשולב", שהוא ממילא זה בלבד ועוד תנאי.
//
// **הבסיס אינו מורץ מחדש.** הוא נמדד היום ב-12:00 באותו מודל ואותו צינור,
// שלוש הרצות לכל מקרה בנוסח הפרוס: AP-0250 ‏0/3 נחתכו, AP-0192 ‏1/3,
// AP-0131 ‏2/3 — 3 מתוך 9. הרצה חוזרת שלו הייתה קונה מספר שכבר יש.
//
// **שלוש חזרות, ואז החלטה** (החלטת גל). בשיעור חיתוך של ~35%, שלוש הרצות
// נקיות ברצף קורות במקרה ב-30% מהמקרים — כלומר אצווה אחת נקייה אינה תשובה,
// היא סיבה לקנות עוד אחת. שתי אצוות נקיות מורידות את זה ל-7.5%. כך משלמים על
// הסבב השני רק כשהראשון מבטיח.
//
// שלושת המקרים הם אלה שבהם **גם הניסיון החוזר נחתך** ביצירה המקורית, כלומר
// הלקוחה קיבלה פריט שקצהו נחתך על ידי המסגרת:
//
//     AP-0250  160.4x73  יחס 2.2
//     AP-0192  160.4x48  יחס 3.34
//     AP-0131  160.4x41  יחס 3.91
//
// הפרומפט הבסיסי נמשך מ-`/api/admin/prompt-lab`, כלומר מה שהקוד הפרוס מייצר
// עכשיו — כך שהניסוי אינו יכול לבדוק קוד שלא נפרס — ומשפט המסגור מצורף לו
// מ-`framing.txt`. הקובץ הזה מושווה ל-`RETRY_FRAMING` בטסט, כדי שהניסוי לא
// ימדוד נוסח שאינו זה שנשלח בייצור.
//
// הרצה: ADMIN_TOKEN=… node docs/research/experiments/wide-ratio/run.mjs [repeats=3] [batch=1]

import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.ADMIN_TOKEN;
const BASE = process.env.SITE_URL || "https://aperta-designs.com";
const REPEATS = Number(process.argv[2] || 3);
/** מזהה האצווה, כדי ששתי אצוות של אותו מקרה לא יתערבבו ביומן. */
const BATCH = (process.argv[3] || "1").trim();

if (!TOKEN) {
  console.error("ADMIN_TOKEN is not set — nothing to run.");
  process.exit(2);
}

const here = path.dirname(new URL(import.meta.url).pathname);
const CASES = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8"));
const FRAMING = fs.readFileSync(path.join(here, "framing.txt"), "utf8").replace(/\n+$/, "");

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

  // נוסח אחד: הפרומפט הפרוס **ועוד** משפט המסגור. הבסיס — אותו פרומפט בלעדיו —
  // נמדד ב-12:00 ואינו מורץ מחדש.
  const prompt = plan.prompt.trimEnd() + FRAMING;

  for (let i = 1; i <= REPEATS; i++) {
    const started = Date.now();
    const name = `edge-ab AP-${c.serial} framing b${BATCH} ${i}`;
    try {
      const { design } = await post("/api/designs", { ...dims, profileId: plan.profileId, name });
      await post("/api/generate", {
        designId: design.id,
        userPrompt: c.userPrompt,
        promptOverride: prompt,
        rowsOverride: plan.rows,
      });
      out.push({ serial: c.serial, batch: BATCH, i, name, designId: design.id, ms: Date.now() - started });
      console.log(`  framing b${BATCH} ${i}/${REPEATS} design=${design.id} ${Date.now() - started}ms`);
    } catch (e) {
      // כשל של קריאה אחת מוציא את עצמו מהמכנה ואינו מפיל את הניסוי.
      out.push({ serial: c.serial, batch: BATCH, i, name, error: String(e.message ?? e) });
      console.error(`  framing b${BATCH} ${i}/${REPEATS} failed: ${e.message ?? e}`);
    }
  }
}

// העיצובים **אינם** נמחקים, בניגוד לקנרית: מחיקה מאפסת את `design_id` ברשומת
// ההרצה, ואז אי אפשר להצמיד הרצה לצד שלה בניסוי.
console.log(`\ndone — ${out.filter((o) => !o.error).length}/${out.length} runs`);
console.log(JSON.stringify(out, null, 2));
