import type { Metadata } from "next";
import { he } from "@/i18n/he";

export const metadata: Metadata = {
  title: `${he.site.ctaStartLong} — ${he.site.brand}`,
  description: he.site.heroSubtitleSeo,
};

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
