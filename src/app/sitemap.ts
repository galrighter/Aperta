import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site.config";

export const dynamic = "force-static";

/**
 * תאריך העדכון האחרון של **התוכן** בכל עמוד.
 *
 * למה מפה מפורשת ולא `new Date()`: `new Date()` בזמן בילד היה מקפיץ את
 * `lastmod` של כל אחד עשר העמודים בכל פריסה — גם פריסה שתיקנה שורת CSS בעמוד
 * אחר. זה אות שקר, ואחרי כמה פעמים שהזחלן חוזר ולא מוצא שינוי הוא לומד
 * להתעלם מהשדה. אותה בעיה, בצורה עדינה יותר, קיימת בגזירה מ-`git log` של קובץ
 * העמוד: רוב הקופי יושב ב-`src/i18n/he.ts`, קובץ אחד שמשרת את כל האתר, ולכן
 * כל שינוי טקסט בעמוד אחד היה מזיז את כולם.
 *
 * `lastmod` הוא גם השדה **היחיד** ב-sitemap שגוגל הצהירה שהיא קוראת —
 * `changefreq` ו-`priority` נשארים כאן כי הם לא מזיקים, אבל היא מתעלמת משניהם.
 *
 * **תחזוקה:** עדכנו את התאריך של עמוד כשהתוכן שלו באמת השתנה. עריכה טכנית
 * שאינה משנה מה שנכתב על המסך אינה עדכון תוכן, ואל תגעו בשורה שלה.
 */
const LAST_MODIFIED: Record<string, string> = {
  "": "2026-08-04",
  "/design": "2026-08-05",
  "/how-it-works": "2026-08-06",
  "/gallery": "2026-08-01",
  "/sizing": "2026-08-04",
  "/design-rules": "2026-08-04",
  "/care": "2026-08-05",
  "/faq": "2026-08-06",
  "/contact": "2026-08-04",
  "/terms": "2026-08-01",
  "/privacy": "2026-08-01",
  "/accessibility": "2026-08-09",
  // story mode — דף הבית החלופי של הניסוי. מוסתר בניווט ופתוח לאינדוקס
  // (STORY_FLOW_PLAN.md §3): אין קישור אליו באתר, אבל אפשר לשלוח אליו תנועה
  // ולמדוד אותה. `/story/create` אינו כאן — הוא שלב בתוך מסע, כמו מסכי `/design`.
  "/story": "2026-08-13",
};

export default function sitemap(): MetadataRoute.Sitemap {
  // `/studio` אינו כאן: הוא הכלי הפנימי, ומאז שהוא יושב מאחורי שער האדמין
  // אינדוקס שלו הוא אינדוקס של דף כניסה. גם קודם הוא לא היה שייך למפה —
  // לקוחה שנוחתת עליו מגוגל פוגשת ממשק בודקים ולא את המשפך.
  const paths = ["", "/design", "/story", "/how-it-works", "/gallery", "/sizing", "/design-rules", "/care", "/faq", "/contact", "/terms", "/privacy", "/accessibility"];
  return paths.map((p) => ({
    url: `${SITE.url}${p}`,
    lastModified: LAST_MODIFIED[p],
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : p === "/design" ? 0.9 : 0.6,
  }));
}
