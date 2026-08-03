import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site.config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // `/studio` אינו כאן: הוא הכלי הפנימי, ומאז שהוא יושב מאחורי שער האדמין
  // אינדוקס שלו הוא אינדוקס של דף כניסה. גם קודם הוא לא היה שייך למפה —
  // לקוחה שנוחתת עליו מגוגל פוגשת ממשק בודקים ולא את המשפך.
  const paths = ["", "/design", "/how-it-works", "/gallery", "/sizing", "/design-rules", "/faq", "/contact", "/terms", "/privacy"];
  return paths.map((p) => ({
    url: `${SITE.url}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : p === "/design" ? 0.9 : 0.6,
  }));
}
