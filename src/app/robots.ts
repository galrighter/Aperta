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
        //
        // `/studio` נוסף כאן ב-6.8: הוא היה מוסר מה-sitemap בלבד, וזו הפסקת
        // הזמנה ולא חסימה. קישור חיצוני אחד היה מספיק כדי שגוגל תזחל דף בן
        // שבע מילים שנשא **בדיוק את הכותרת והתיאור של דף הבית** — כלומר תעמיד
        // אותו כמועמד קנוניקל מול העמוד היחיד שכן חשוב.
        disallow: ["/api/", "/admin", "/debug", "/studio"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
