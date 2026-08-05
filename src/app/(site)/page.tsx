import Image from "next/image";
import Link from "next/link";
import { he } from "@/i18n/he";

const s = he.site;

// handoff v3 §בית — הצהרת מותג רגשית, CTA יחיד, ורצועת מניפסט.
// הסברי התהליך ("איך מתחילים" / רצועת השלבים) הוסרו במכוון: הם חיים ב-/how-it-works.
export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-[1240px] px-5 pt-14 pb-12 sm:px-10 sm:pt-[84px] sm:pb-[72px]">
        <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr] md:gap-[72px]">
          <div>
            <div className="mb-5 font-display text-xs tracking-[0.42em] text-lapis sm:mb-7">
              {s.heroEyebrow}
            </div>
            <h1
              className="mb-6 text-[44px] font-semibold leading-[1.03] sm:text-[72px] lg:text-[82px]"
              style={{ letterSpacing: "-2px", textWrap: "balance" }}
            >
              {s.heroTitleLine1}
              <br />
              {s.heroTitleLine2}
            </h1>
            <p
              className="mb-10 max-w-[430px] text-[19px] leading-relaxed text-ink80"
              style={{ textWrap: "pretty" }}
            >
              {s.heroSubtitle}
            </p>
            <div className="flex flex-wrap items-center gap-4.5">
              <Link
                href="/design"
                className="rounded-[2px] bg-graphite px-[42px] py-[18px] text-[17px] font-semibold tracking-wide text-porcelain transition-colors hover:bg-graphite/90"
              >
                {s.heroCtaPrimary}
              </Link>
              <span className="font-display text-[13px] tracking-[0.12em] text-mist">
                {s.heroPriceNote}
              </span>
            </div>
          </div>

          <div className="relative">
            {/* מסגרת לאפיס מוסטת — דקורטיבית בלבד */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-5 -left-5 h-full w-full border-[1.5px] border-lapis/40"
            />
            <div
              className="relative overflow-hidden border border-graphite/10"
              style={{ aspectRatio: "4 / 5" }}
            >
              <Image
                src="/bracelet-hero.webp"
                alt={s.heroImageAlt}
                width={1122}
                height={1402}
                priority
                sizes="(max-width: 768px) 100vw, 40vw"
                className="block h-full w-full object-cover"
              />
            </div>
            <div className="absolute bottom-5 -right-3.5 whitespace-nowrap border border-graphite/[0.14] bg-porcelain px-[18px] py-2.5 font-display text-[11px] tracking-[0.22em]">
              {s.heroPieceTag}
            </div>
          </div>
        </div>
      </section>

      {/* רצועת מניפסט */}
      <section className="border-y border-graphite/10 bg-porcelain-slab/55">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 px-5 py-9 sm:px-10">
          <p className="text-[24px] font-light text-graphite" style={{ textWrap: "balance" }}>
            {s.manifestoLine}
          </p>
          <div className="flex items-center gap-3 font-display text-[11px] tracking-[0.2em] text-ink60">
            <span className="border border-graphite/15 px-3 py-1.5">{s.manifestoTag1}</span>
            <span className="border border-graphite/15 px-3 py-1.5">{s.manifestoTag2}</span>
          </div>
        </div>
      </section>
    </>
  );
}
