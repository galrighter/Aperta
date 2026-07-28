import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site.config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // `/debug` מוגן ב-`requireAdmin`; זו הקשחה משנית בלבד — robots הוא בקשה
        // מנומסת לזחלן, לא הגנה.
        disallow: ["/api/", "/admin", "/debug"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
