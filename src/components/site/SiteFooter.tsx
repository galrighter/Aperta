import Link from "next/link";
import { he } from "@/i18n/he";
import { NAV, SITE } from "@/lib/site.config";

const s = he.site;

export default function SiteFooter() {
  return (
    <footer className="relative z-[2] mt-24 border-t border-graphite/10">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="font-display text-[15px] font-semibold tracking-[0.25em] text-graphite">
              {s.brand}
            </div>
            <p className="mt-2 text-sm text-mist">{s.tagline}</p>
          </div>

          <nav className="flex flex-col gap-2.5 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink60 transition-colors hover:text-cobalt"
              >
                {s[item.key]}
              </Link>
            ))}
            {/* bdi ולא dir="ltr": dir על האלמנט הופך גם את text-align:start שלו,
                והמייל היה נצמד לשמאל בזמן ששאר העמודה ימנית. bdi מבודד את
                הכיווניות של הטקסט בלבד ומשאיר את היישור של העמודה. */}
            <a
              href={`mailto:${SITE.contactEmail}`}
              className="text-ink60 transition-colors hover:text-cobalt"
            >
              <bdi>{SITE.contactEmail}</bdi>
            </a>
          </nav>

          <nav className="flex flex-col gap-2.5 text-sm">
            <span className="text-xs font-medium tracking-wide text-mist">{s.footerLegal}</span>
            <Link href="/terms" className="text-ink60 transition-colors hover:text-cobalt">
              {s.navTerms}
            </Link>
            <Link href="/privacy" className="text-ink60 transition-colors hover:text-cobalt">
              {s.navPrivacy}
            </Link>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-graphite/10 pt-6 text-[13px] text-mist sm:flex-row sm:items-center sm:justify-between">
          <span>{s.footerTagline}</span>
          <span className="font-display tracking-[0.15em]">{s.footerCopyright}</span>
        </div>
      </div>
    </footer>
  );
}
