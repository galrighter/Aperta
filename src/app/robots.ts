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
        //
        // `/auth` נוסף ב-9.8: `/auth/callback` מחזיר 303 לכל בקשה שאינה חזרה
        // תקפה מ-OAuth, כלומר לכל זחילה. החסימה כאן היא מה שמונע ממנו להופיע
        // בדוח «הדף מפנה לכתובת אתר אחרת» מלכתחילה; `X-Robots-Tag`
        // ב-`middleware.ts` הוא הרשת מתחת, לזחלן שהגיע בלי לקרוא את הקובץ הזה.
        // חסימה בטוחה כאן: robots.txt נקרא רק בידי זחלנים, ומסע ההתחברות של
        // לקוחה אינו עובר בו.
        disallow: ["/api/", "/admin", "/debug", "/studio", "/auth"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
