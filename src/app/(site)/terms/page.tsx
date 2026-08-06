import type { Metadata } from "next";
import { he } from "@/i18n/he";
import LegalPage from "@/components/site/LegalPage";

const t = he.site.terms;

export const metadata: Metadata = {
  title: `${t.title} — ${he.site.brand}`,
  description: he.site.termsMetaDescription,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage title={t.title} intro={t.intro} sections={t.sections} />;
}
