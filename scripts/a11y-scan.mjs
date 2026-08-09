#!/usr/bin/env node
/**
 * שער הנגישות — סריקת axe על בילד ייצור.
 *
 * למה סקריפט ולא טסט ב-vitest: הבדיקה דורשת בילד, שרת שרץ ודפדפן אמיתי. לתלות
 * את `npm test` בשלושת אלה פירושו שלולאת הפיתוח הרגילה נעשית איטית פי כמה, וזו
 * הדרך הבטוחה לגרום למישהו לכבות אותה. כאן היא פקודה נפרדת שרצה ב-CI אחרי
 * ה-build, ומקומית על פי דרישה.
 *
 * **רשימת הנתיבים נגזרת מ-sitemap.xml של השרת עצמו** ולא מרשימה קשיחה כאן.
 * עמוד ציבורי חדש נכנס ל-sitemap ממילא (זו הדרישה של ה-SEO), ומאותו רגע הוא
 * נסרק — בלי שאיש יזכור להוסיף אותו לשני מקומות. `/nope-404` מתווסף ידנית כי
 * מטבע הדברים הוא לא ב-sitemap, והוא עמוד אמיתי שמשתמשים נוחתים עליו.
 *
 * שתי רזולוציות, כי חלק מהממצאים קיימים רק באחת מהן: אזור גלילה שנוצר רק
 * כשהטבלה רחבה מהמסך, וטקסט שנופל על צורה דקורטיבית אחרת בפריסה אחרת.
 */
import { spawn } from "node:child_process";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";

const PORT = Number(process.env.A11Y_PORT ?? 3311);
const BASE = `http://127.0.0.1:${PORT}`;
const EXTRA_PATHS = ["/nope-404-a11y-probe"];

// אלה הקריטריונים שת"י 5568 מאמץ (WCAG 2.0 AA), ובנוסף 2.1 AA — שאינו נדרש
// בתקנה אבל כן ב-EAA, והמחיר השולי שלו כאן אפסי.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

/** מרים `next start` ומחכה שיענה. מחזיר את התהליך כדי שאפשר יהיה להרוג אותו. */
async function startServer() {
  // `stdio: "ignore"` ולא `pipe`: פייפ שאיש אינו קורא ממנו מתמלא, והכתיבה
  // הבאה של הילד נחסמת — כלומר השרת נתקע ברגע שהוא מדפיס מספיק. הלוג שלו
  // ממילא אינו מעניין כאן; מה שמעניין הוא אם הוא עונה, וזה נבדק למטה.
  //
  // `detached: true` כדי שתהיה קבוצת תהליכים שאפשר להרוג בשלמותה. `npx` הוא
  // עטיפה שמריצה את `next` כילד, ו-`proc.kill()` מגיע לעטיפה בלבד: השרת עצמו
  // שורד. ב-CI זה נראה כ-`Terminate orphan process: next-server` בסוף ה-job,
  // ומקומית זה משאיר שרת תפוס על הפורט שמפיל את ההרצה הבאה.
  const proc = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env },
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(2000) });
      if (res.ok) return proc;
    } catch {
      /* עוד לא עלה */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopServer(proc);
  throw new Error(`השרת לא ענה על ${BASE} תוך 90 שניות`);
}

/** הורג את כל קבוצת התהליכים — ראו הנימוק ל-`detached` למעלה. */
function stopServer(proc) {
  try {
    process.kill(-proc.pid);
  } catch {
    // כבר מת, או שהמערכת אינה תומכת בהריגת קבוצה. נפילה חזרה לילד עצמו.
    try {
      proc.kill();
    } catch {
      /* אין מה לעשות */
    }
  }
}

async function routesFromSitemap() {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p, i, all) => all.indexOf(p) === i);
  if (paths.length === 0) throw new Error("sitemap.xml ריק — הסריקה לא הייתה בודקת דבר");
  return [...paths, ...EXTRA_PATHS];
}

const server = await startServer();
let failed = 0;

try {
  const paths = await routesFromSitemap();
  console.log(`סורק ${paths.length} נתיבים × ${VIEWPORTS.length} רזולוציות\n`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "he-IL",
    });
    for (const path of paths) {
      const page = await ctx.newPage();
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30_000 });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      if (violations.length === 0) {
        console.log(`  ✓ ${path} (${vp.name})`);
      } else {
        failed += violations.length;
        console.log(`  ✗ ${path} (${vp.name})`);
        for (const v of violations) {
          console.log(`      [${v.impact}] ${v.id} — ${v.help}  (${v.nodes.length})`);
          for (const node of v.nodes.slice(0, 3)) {
            console.log(`        ${node.target.join(" ")}`);
            const why = (node.failureSummary ?? "").replace(/\s+/g, " ").trim();
            if (why) console.log(`        ${why.slice(0, 200)}`);
          }
        }
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  stopServer(server);
}

if (failed > 0) {
  console.error(`\nנכשל: ${failed} ממצאי נגישות. ראו docs/ACCESSIBILITY_PLAN.md`);
  process.exit(1);
}
console.log("\nעבר: אין ממצאי axe ברמה AA באף נתיב ובאף רזולוציה.");
