import type { NextConfig } from "next";

/**
 * ‏CSP וכותרות האבטחה של האתר.
 *
 * **מה זה סוגר ומה לא.** ה-CSP כאן אינו נעילה מלאה על סקריפטים: ‏Next מזריק
 * סקריפטים inline (ה-bootstrap וה-hydration data), ואכיפה עליהם דורשת nonce
 * שנוצר בבקשה — כלומר middleware שמזריק אותו לכל תשובה, על runtime שרץ בקצה,
 * ובדיקה של כל מסלול. זה שינוי אמיתי ולא שורה בקונפיג, ולכן `script-src`
 * נשאר עם `'unsafe-inline'` והמסמך הזה אומר זאת במפורש במקום להיראות מוגן.
 *
 * מה שכן נסגר, וזה לא מעט:
 * - **`frame-ancestors 'none'`** — אי אפשר לעטוף את האתר ב-iframe. זו ההגנה
 *   מ-clickjacking על מסך הצ'קאאוט, ואין באתר שום iframe שנשבר מזה (נבדק).
 * - **`form-action 'self'`** — טופס לא יכול להישלח ליעד חיצוני. בלי זה, XSS
 *   שמצליח לשנות `action` שולח את הכתובת והטלפון של הלקוחה למקום אחר.
 * - **`base-uri 'self'`** — הזרקת `<base>` לא יכולה להסיט את כל הנתיבים
 *   היחסיים בעמוד לדומיין של תוקף.
 * - **`object-src 'none'`**, **`default-src 'self'`** — אין תוספים, ואין
 *   טעינה מדומיין שלא הוכרז.
 *
 * **מה מוכרז החוצה, ולמה:** ‏Supabase (אימות מהדפדפן) ו-Cloudflare Insights
 * (הביקון, אם הוגדר טוקן). שניהם נגזרים מהסביבה ולא נכתבים קשיח — דומיין
 * שמשתנה בלי שה-CSP יידע הוא אתר שמפסיק להתחבר בלי הודעה.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const CF_SCRIPT = "https://static.cloudflareinsights.com";
const CF_CONNECT = "https://cloudflareinsights.com";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // blob: — ההדמיה מייצרת תמונות בזיכרון (canvas → blob) לשיתוף ולתצוגה.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // הפונטים מתארחים עצמית, אבל Next מזריק `<style>` inline לטעינה שלהם.
  "style-src 'self' 'unsafe-inline'",
  // ‏'unsafe-eval' בפיתוח בלבד — ה-refresh runtime של Next משתמש בו.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} ${CF_SCRIPT}`,
  `connect-src 'self' ${supabaseOrigin} ${CF_CONNECT}`.trim(),
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const SECURITY_HEADERS = [
  { key: "content-security-policy", value: csp },
  // כפילות מכוונת מול `frame-ancestors`: דפדפנים ישנים אינם מכירים אותו.
  { key: "x-frame-options", value: "DENY" },
  { key: "x-content-type-options", value: "nosniff" },
  // המקור נשלח לאתרים אחרים, הנתיב לא. ‏`/d/<token>` הוא סוד, והוא היה נוסע
  // ככותרת Referer לכל דומיין שלוחצים אליו מהעמוד.
  { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
  { key: "permissions-policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // שנתיים, כולל תת-דומיינים. הדומיין כבר מוגש ב-HTTPS בלבד דרך Cloudflare.
  { key: "strict-transport-security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Server-side geometry/LLM work only; no image optimization needed on Workers.
  images: { unoptimized: true },

  async redirects() {
    return [
      {
        // /order הוסר: הטופס שלו כתב ל-`inquiries`, טבלה שלא קיימת בייצור, ולכן
        // כל שליחה החזירה 500 והבקשה אבדה. 308 ולא 404 — הכתובת פורסמה ב-sitemap
        // וייתכן שנאספה, ומבקר שמגיע אליה צריך לנחות במסלול שעובד.
        source: "/order",
        destination: "/contact",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        // כותרות אבטחה לכל האתר (docs/FULL_AUDIT_2026-08.md, פרק 2 — הקשחה).
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // הבק־אופיס נבנה סטטית וקיבל `s-maxage=31536000` — שנה שלמה של קאשינג
        // משותף על דף שכל תפקידו להראות את המצב עכשיו. אחרי פריסה זה אומר
        // שממשיכים לראות את הגרסה הישנה, ותיקון נראה כאילו לא נקלט.
        source: "/debug",
        headers: [{ key: "cache-control", value: "no-store, must-revalidate" }],
      },
      {
        // תשובות ה-API לא נשמרות בשום שכבה: הן מצב, לא תוכן.
        source: "/api/:path*",
        headers: [{ key: "cache-control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;

// Enable local dev integration with the Cloudflare runtime when running `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
