import type { NextConfig } from "next";
import { buildCsp, supabaseOrigin } from "./src/lib/csp";

// כותרות האבטחה של האתר. המדיניות עצמה יושבת ב-`src/lib/csp` כדי שאפשר יהיה
// לבדוק אותה — הקובץ הזה נטען עם `initOpenNextCloudflareForDev` ואינו נגיש
// לבדיקות. ראו שם את הנימוק לכל הנחיה.
const csp = buildCsp({
  origin: supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL),
  dev: process.env.NODE_ENV === "development",
});

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
