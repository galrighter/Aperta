import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";
import FaqAccordion from "@/components/site/FaqAccordion";

const s = he.site;

export const metadata: Metadata = {
  title: `${s.faqTitle} — ${s.brand}`,
  description: s.faqSubtitle,
};

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {s.faqTitle}
      </h1>
      <p className="mt-3 text-lg text-ink60">{s.faqSubtitle}</p>

      <div className="mt-10">
        <FaqAccordion items={s.faqItems} />
      </div>

      <p className="mt-8 text-sm text-ink60">
        {s.contactSubtitle}{" "}
        <Link href="/contact" className="font-medium text-cobalt hover:underline">
          {s.navContact}
        </Link>{" "}
        ·{" "}
        <a
          href={`mailto:${SITE.contactEmail}`}
          dir="ltr"
          className="font-medium text-cobalt hover:underline"
        >
          {SITE.contactEmail}
        </a>
      </p>
    </div>
  );
}
