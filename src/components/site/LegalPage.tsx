import { he } from "@/i18n/he";

const s = he.site;

export default function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: readonly { h: string; p: string }[];
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-mist">{s.legalUpdated}</p>
      <p className="mt-6 leading-relaxed text-ink80">{intro}</p>

      <div className="mt-8 flex flex-col gap-6">
        {sections.map((sec, i) => (
          <section key={i}>
            <h2 className="text-lg font-semibold text-graphite">{sec.h}</h2>
            <p className="mt-1 leading-relaxed text-ink60">{sec.p}</p>
          </section>
        ))}
      </div>

      <p className="mt-12 rounded-[2px] border border-graphite/10 bg-white p-4 text-xs text-ink60">
        {s.legalNote}
      </p>
    </div>
  );
}
