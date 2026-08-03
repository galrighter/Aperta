import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site.config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/design", "/how-it-works", "/gallery", "/sizing", "/design-rules", "/faq", "/contact", "/terms", "/privacy", "/studio"];
  return paths.map((p) => ({
    url: `${SITE.url}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : p === "/design" || p === "/studio" ? 0.9 : 0.6,
  }));
}
