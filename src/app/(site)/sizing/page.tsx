import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";
import { FAB, type FitStyle } from "@/lib/fabrication.config";
import { US_RING_SIZES, US_RING_ID_MM } from "@/lib/sizing";

const s = he.site;
const g = s.sizing;

export const metadata: Metadata = {
  title: `${g.title} — ${s.brand}`,
  description: g.subtitle,
  alternates: { canonical: "/sizing" },
};

const r1 = (v: number) => Math.round(v * 10) / 10;

// הטבלאות נגזרות מהמנוע ולא נכתבות ביד. מדריך שנוקב במספרים הוא טענה על מה
// שהמפעל מייצר, ואם הוא מועתק פעם אחת הוא סוטה לנצח בלי שאיש ישים לב —
// בדיוק מה שקרה למדריך שבתוך מסע היצירה. ראו docs/sizing-fit-review.md §5א.
const RING_ROWS = US_RING_SIZES.map((size) => {
  const id = US_RING_ID_MM[String(size)];
  return { size, id: r1(id), circumference: r1(Math.PI * id) };
});

const FIT_ROWS = (["snug", "comfort", "loose"] as FitStyle[]).map((style) => ({
  style,
  label: style === "snug" ? he.fitSnug : style === "comfort" ? he.fitComfort : he.fitLoose,
  easeMm: FAB.fitEaseMm[style],
  meaning: g.fitRows[style],
}));

export default function SizingPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {g.title}
      </h1>
      <p className="mt-3 text-lg text-ink60">{g.subtitle}</p>

      {/* ===== טבעת ===== */}
      <Section title={g.ringTitle} intro={g.ringIntro}>
        <Method title={g.ringMethod1Title} steps={g.ringMethod1Steps} />
        <p className="mt-3 rounded-[2px] border-r-2 border-lapis bg-porcelain px-4 py-3 text-sm text-graphite">
          {g.ringMethod1Warn}
        </p>

        <Method title={g.ringMethod2Title} steps={g.ringMethod2Steps} className="mt-8" />

        <h3 className="mt-10 text-base font-semibold text-graphite">{g.ringTableTitle}</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-graphite/20 text-right text-ink60">
                <Th>{g.ringTableCols.size}</Th>
                <Th>{g.ringTableCols.diameter}</Th>
                <Th>{g.ringTableCols.circumference}</Th>
              </tr>
            </thead>
            <tbody>
              {RING_ROWS.map((row) => (
                <tr key={row.size} className="border-b border-graphite/10">
                  <Td className="font-medium text-graphite">{row.size}</Td>
                  <Td>{row.id} מ״מ</Td>
                  <Td>{row.circumference} מ״מ</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-sm text-ink60">{g.ringNotAdjustable}</p>
      </Section>

      {/* ===== צמיד ===== */}
      <Section title={g.wristTitle} intro={g.wristIntro}>
        <Steps items={g.wristSteps} />
        <p className="mt-4 text-sm text-ink60">{g.wristNote}</p>

        <h3 className="mt-10 text-base font-semibold text-graphite">{g.fitTitle}</h3>
        <p className="mt-2 text-sm text-ink60">{g.fitIntro}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-graphite/20 text-right text-ink60">
                <Th>{g.fitTableCols.style}</Th>
                <Th>{g.fitTableCols.ease}</Th>
                <Th>{g.fitTableCols.meaning}</Th>
              </tr>
            </thead>
            <tbody>
              {FIT_ROWS.map((row) => (
                <tr key={row.style} className="border-b border-graphite/10">
                  <Td className="font-medium text-graphite">{row.label}</Td>
                  <Td>+{row.easeMm} מ״מ</Td>
                  <Td>{row.meaning}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ===== טיפים ===== */}
      <Section title={g.tipsTitle}>
        <ul className="space-y-3">
          {g.tips.map((tip) => (
            <li key={tip} className="flex gap-3 text-ink60">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lapis" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
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

function Section({
  title, intro, children,
}: {
  title: string; intro?: string; children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <h2 className="text-[22px] font-semibold tracking-tight text-graphite sm:text-[26px]">
        {title}
      </h2>
      {intro && <p className="mt-2 text-ink60">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Method({
  title, steps, className = "",
}: {
  title: string; steps: readonly string[]; className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="text-base font-semibold text-graphite">{title}</h3>
      <div className="mt-3">
        <Steps items={steps} />
      </div>
    </div>
  );
}

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((step, i) => (
        <li key={step} className="flex gap-3 text-ink60">
          <span
            aria-hidden
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-graphite text-[11px] font-medium text-porcelain"
          >
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="py-2 pl-4 text-right font-medium last:pl-0">{children}</th>
);

const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`py-2 pl-4 text-ink60 last:pl-0 ${className}`}>{children}</td>
);
