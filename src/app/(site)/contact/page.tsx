import type { Metadata } from "next";
import { he } from "@/i18n/he";
import { SITE, businessIdentified, businessLines, whatsappUrl } from "@/lib/site.config";
import ContactForm from "@/components/site/ContactForm";

const s = he.site;

export const metadata: Metadata = {
  title: `${s.contactTitle} — ${s.brand}`,
  description: s.contactSubtitle,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const wa = whatsappUrl(s.whatsappPrefill);
  return (
    <div className="ap-surface mx-auto max-w-3xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {s.contactTitle}
      </h1>
      <p className="mt-3 text-lg text-ink60">{s.contactSubtitle}</p>

      <div className="mt-10 border border-graphite/10 bg-chalk p-6 sm:p-8">
        <ContactForm />
      </div>

      <p className="mt-6 text-sm text-ink60">
        {s.contactOr}{" "}
        <a
          href={`mailto:${SITE.contactEmail}`}
          dir="ltr"
          className="font-medium text-lapis hover:underline"
        >
          {SITE.contactEmail}
        </a>
      </p>

      {/* וואטסאפ לצד הטופס, לא במקומו: טופס נשלח לתיבה שנקראת פעם ביום,
          ווואטסאפ נענה מיד — ובקהל ישראלי-מובייל זה ההבדל בין שאלה שנשאלת
          לשאלה שנזנחת (docs/FULL_AUDIT_2026-08.md, פרק 4, ממצא R5). */}
      {wa && (
        <p className="mt-3 text-sm">
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-lapis hover:underline"
          >
            {s.contactWhatsappCta}
          </a>
        </p>
      )}

      {/* זהות העוסק, בעמוד שאליו מגיעים כדי לדעת עם מי מדברים. */}
      {businessIdentified() && (
        <p className="mt-6 text-[13px] text-mist">{businessLines().join(" · ")}</p>
      )}
    </div>
  );
}
