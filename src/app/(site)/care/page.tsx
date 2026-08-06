import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";

// "תחזוקת התכשיט" — העמוד שתנאי השימוש מפנים אליו.
//
// סעיף התחזוקה בתנאים מטיל חובה על הלקוחה ("תחזוקה ראויה כמפורט… בעמוד
// התחזוקה באתר"). חובה שאין לה כתובת אינה חובה אלא הסתייגות, ולכן העמוד הזה
// אינו נחמד-שיהיה: הוא הצד השני של סעיף האחריות.
//
// כל התוכן יושב ב-`he.site.care`, כולל רשימת המתכות. אין כאן מספרים שנגזרים
// מהמנוע — בניגוד למדריך המידות, ששואב את הטבלאות שלו מ-lib/sizing.

const s = he.site;
const g = s.care;

export const metadata: Metadata = {
  title: `${g.title} — ${s.brand}`,
  description: g.subtitle,
  alternates: { canonical: "/care" },
};

export default function CarePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {g.title}
      </h1>
      <p className="mt-3 text-lg text-ink60">{g.subtitle}</p>

      <div className="mt-8 space-y-4">
        {g.intro.map((p) => (
          <p key={p} className="leading-relaxed text-ink80" style={{ textWrap: "pretty" }}>
            {p}
          </p>
        ))}
      </div>

      <Section title={g.generalTitle}>
        <ul className="space-y-3">
          {g.general.map((rule) => (
            <li key={rule} className="flex gap-3 text-ink60">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lapis" />
              <span style={{ textWrap: "pretty" }}>{rule}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={g.metalsTitle}>
        <p className="leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {g.metalsIntro}
        </p>

        {/* כל מתכת בשלוש שורות קבועות — מה קורה לה, מה עושים, ממה נמנעים.
            המבנה זהה לכולן בכוונה: לקוחה שמחפשת "מה לא לעשות" צריכה למצוא את
            השורה באותו מקום בכל סעיף, ולא לקרוא פסקה שלמה כדי לגלות אם היא שם. */}
        <ul className="mt-8 space-y-8">
          {g.metals.map((m) => (
            <li key={m.name} className="border-s-2 border-graphite/15 ps-4">
              <h3 className="text-base font-semibold text-graphite">
                {m.name}
                {m.note && <span className="ms-2 text-sm font-normal text-mist">{m.note}</span>}
              </h3>
              <dl className="mt-2 space-y-2">
                <Fact label={g.metalLabels.behavior} value={m.behavior} />
                <Fact label={g.metalLabels.routine} value={m.routine} />
                <Fact label={g.metalLabels.avoid} value={m.avoid} />
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={g.delicateTitle}>
        <div className="space-y-4">
          {g.delicateBody.map((p) => (
            <p key={p} className="leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
              {p}
            </p>
          ))}
        </div>
        <ul className="mt-6 space-y-3">
          {g.delicateTips.map((tip) => (
            <li key={tip} className="flex gap-3 text-ink60">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lapis" />
              <span style={{ textWrap: "pretty" }}>{tip}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={g.warrantyTitle}>
        <p className="leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {g.warrantyBody}{" "}
          <Link href="/terms" className="font-medium text-lapis hover:underline">
            {g.warrantyLink}
          </Link>
        </p>
      </Section>

      <p className="mt-14 text-sm text-ink60">
        {g.ctaText}{" "}
        <Link href="/contact" className="font-medium text-lapis hover:underline">
          {g.ctaLink}
        </Link>{" "}
        ·{" "}
        <a
          href={`mailto:${SITE.contactEmail}`}
          dir="ltr"
          className="font-medium text-lapis hover:underline"
        >
          {SITE.contactEmail}
        </a>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-[22px] font-semibold tracking-tight text-graphite sm:text-[26px]">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-mist">{label}</dt>
      <dd className="mt-0.5 leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
        {value}
      </dd>
    </div>
  );
}
