import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-side geometry/LLM work only; no image optimization needed on Workers.
  images: { unoptimized: true },

  async headers() {
    return [
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
