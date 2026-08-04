import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";

// "כללים לייצור עיצוב" — הדף שכפתור השגיאה על דחיית מסנן מוביל אליו.
//
// למה דף באתר ולא טקסט ארוך יותר בהודעת השגיאה: ההודעה צריכה לומר משפט אחד —
// המודל סירב, ומה לעשות עכשיו — והרשימה המלאה שייכת למקום שאפשר לקרוא בשקט,
// לשלוח אליו קישור, ולעדכן בלי לגעת במסך היצירה.
//
// כל התוכן יושב ב-`he.site.designRules`, כולל ההסתייגות על מסנן שהוא קופסה
// שחורה. אין כאן מספרים שנגזרים מהמנוע, ולכן אין מה לחשב — בניגוד למדריך
// המידות, ששואב את הטבלאות שלו מ-lib/sizing.

const s = he.site;
const g = s.designRules;

export const metadata: Metadata = {
  title: `${g.title} — ${s.brand}`,
  description: g.subtitle,
};

export default function DesignRulesPage() {
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

      <Section title={g.casesTitle}>
        <ul className="space-y-6">
          {g.cases.map((c) => (
            <li key={c.title} className="border-s-2 border-graphite/15 ps-4">
              <h3 className="text-base font-semibold text-graphite">{c.title}</h3>
              <p className="mt-1 leading-relaxed text-ink60">{c.body}</p>
              {/* "מה לכתוב במקום" הוא הדבר היחיד בדף שהלקוחה יכולה לפעול לפיו
                  מיד, ולכן הוא מסומן ולא נבלע בפסקה. יש קטגוריות שאין להן
                  ניסוח חלופי — שם השדה ריק, ולא ממציאים לו אחד. */}
              {c.instead && (
                <p className="mt-2 border-s-2 border-lapis bg-porcelain px-4 py-2.5 text-sm leading-relaxed text-graphite">
                  {c.instead}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={g.falsePositiveTitle}>
        <p className="leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {g.falsePositiveBody}
        </p>
      </Section>

      <Section title={g.howToTitle}>
        <ul className="space-y-3">
          {g.howTo.map((tip) => (
            <li key={tip} className="flex gap-3 text-ink60">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lapis" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={g.notFilterTitle}>
        <p className="leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {g.notFilterBody}{" "}
          <Link href="/sizing" className="font-medium text-lapis hover:underline">
            {g.sizingLink}
          </Link>
        </p>
      </Section>

      <p className="mt-14 text-sm text-ink60">
        {g.ctaText}{" "}
        <Link href="/design" className="font-medium text-lapis hover:underline">
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
