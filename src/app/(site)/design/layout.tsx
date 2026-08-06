import type { Metadata } from "next";
import { he } from "@/i18n/he";

export const metadata: Metadata = {
  title: `${he.site.ctaStartLong} — ${he.site.brand}`,
  description: he.site.designMetaDescription,
  // `d/[token]` מקשר ל-`/design?from=<token>`, כלומר וריאציות query של אותו
  // עמוד כבר נוצרות בקוד — ולכל כלי שיתוף שמוסיף `?utm_source=` יש אותו
  // אפקט. הקנוניקל מאחד את כולן לכתובת אחת.
  alternates: { canonical: "/design" },
};

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
