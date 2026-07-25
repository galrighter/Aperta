import type { MetadataRoute } from "next";
import { he } from "@/i18n/he";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${he.site.brand} — ${he.site.tagline}`,
    short_name: he.site.brand,
    description: he.site.heroSubtitleSeo,
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#f4f1eb",
    theme_color: "#202326",
    // SVG לדפדפנים שתומכים, PNG כגיבוי למשגרי אנדרואיד/iOS שלא מרנדרים SVG,
    // ו-maskable נפרד שהתוכן שלו בתוך אזור הבטיחות כדי שלא ייחתך בעיגול.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
