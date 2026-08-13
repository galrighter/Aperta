// הכניסה ל-Worker של האתר — העטיפה שמוסיפה את המתזמן.
//
// **למה זה קיים.** הסריקה שמסיימת הרצות תקועות (`/api/jobs/sweep`) הייתה
// מתוזמנת ב-GitHub Actions על `*/10`, ובפועל היא רצה **בערך פעם בשעה**: 12
// ההרצות שקדמו ל-13.8 היו במרווחים של 50 עד 108 דקות. GitHub מווסת `schedule`
// בתדירות גבוהה, וההערה שם צפתה איחור "של דקות" — לא של שעה.
//
// המחיר נמדד באותו יום: הרצה נתקעה ב-18:08 ונעשתה כשירה לאיסוף ב-18:14.
// הסריקה הקודמת רצה ב-17:42 והבאה הייתה מגיעה בערך ב-18:45 — כלומר איש לא היה
// בדרך. הלקוח ישב מול מסך טעינה 11.5 דקות, ומה שסיים את ההרצה בסוף היה לחיצה
// ידנית על "להשלים את היצירה". Cron Trigger של Cloudflare יורה בזמן.
//
// **למה עטיפה ולא `scheduled` בקוד של Next.** הכניסה של ה-Worker נוצרת על ידי
// OpenNext (`.open-next/worker.js`) ומייצאת `fetch` בלבד; אין בה מקום להוסיף
// בו handler שני. זה בדיוק מה שההערה ב-workflow קראה לו "הצעד הנכון אם
// התדירות תהפוך לקריטית". הקובץ הזה הוא הצעד: הוא מעביר `fetch` הלאה כמות
// שהוא, ומוסיף `scheduled` לצדו.
//
// **ולמה המתזמן קורא ל-fetch ולא ל-`sweepStalledJobs` ישירות.** הקוד של
// הסריקה חי בתוך הבאנדל של Next, על הרצת-בקשה שמכינה `process.env` מה-bindings
// (`runWithCloudflareRequestContext`). קריאה אליו מכאן הייתה מחייבת עותק שני של
// ההכנה הזו — וזה בדיוק סוג הכפילות שנשחקת בשקט. במקום זה המתזמן שולח בקשה
// רגילה לאותו Worker, דרך אותו שער בדיוק שהמתזמן הקודם השתמש בו.

import worker from "./.open-next/worker.js";

// מחלקות ה-Durable Object שהתבנית של OpenNext מייצאת. `export *` ולא רשימה:
// מה שמיוצא שם נקבע בבנייה, ורשימה כאן הייתה מתיישנת בשקט בשדרוג.
export * from "./.open-next/worker.js";

/** הדומיין הקנוני. שווה ל-`SITE.url`, ומוגדר כאן כי הקובץ הזה מחוץ לבאנדל. */
const SITE_URL = "https://aperta-designs.com";

const entry = {
  ...worker,
  // מועבר בקריאה מפורשת ולא בהעתקת ההפניה: כך `this` נשאר האובייקט של OpenNext,
  // ולא האובייקט הזה.
  fetch: (request, env, ctx) => worker.fetch(request, env, ctx),

  /**
   * הסריקה התקופתית.
   *
   * **לעולם לא זורק.** `scheduled` שנכשל אינו נוגע ב-`fetch`, אבל הוא כן צובע
   * את ההרצה כשגיאה ביומן — ולכן הכשל נרשם כאן במפורש, עם הסטטוס והגוף, כדי
   * שיהיה אפשר להבדיל בין "הסריקה לא רצה" לבין "רצה ומשהו אחד בתוכה נכשל".
   * זו אותה הבחנה שה-workflow הקודם התעקש עליה.
   */
  async scheduled(event, env, ctx) {
    try {
      const res = await worker.fetch(
        new Request(`${SITE_URL}/api/jobs/sweep`, {
          method: "POST",
          headers: { authorization: `Bearer ${env.ADMIN_TOKEN ?? ""}` },
        }),
        env,
        ctx,
      );
      const body = await res.text();
      if (!res.ok) {
        console.error(`sweep: HTTP ${res.status} ${body}`);
        return;
      }
      console.log(`sweep: ${body}`);
    } catch (e) {
      console.error("sweep: did not run:", e instanceof Error ? e.message : String(e));
    }
  },
};

export default entry;
