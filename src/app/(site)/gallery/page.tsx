import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import PatternMark, { type PatternVariant } from "@/components/site/PatternMark";

const s = he.site;

export const metadata: Metadata = {
  title: `${s.galleryTitle} — ${s.brand}`,
  description: s.gallerySubtitle,
  alternates: { canonical: "/gallery" },
};

const VARIANTS: PatternVariant[] = [
  "hexagons",
  "waves",
  "circles",
  "diamonds",
  "drops",
  "stripes",
];

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {s.galleryTitle}
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-ink60">{s.gallerySubtitle}</p>

      {/* צילום מוצר אמיתי — בלוק מוביל, נבדל מרשת האיורים שמתחת */}
      <figure className="mt-10 grid overflow-hidden border border-graphite/10 bg-white sm:grid-cols-2">
        <div className="flex items-center justify-center bg-porcelain p-4 sm:p-6">
          <Image
            src="/ring-hero.webp"
            alt={s.galleryFeaturedAlt}
            width={1122}
            height={1402}
            sizes="(max-width: 640px) 100vw, 448px"
            className="h-auto w-full max-w-md object-contain"
          />
        </div>
        <figcaption className="flex flex-col justify-center gap-3 border-t border-graphite/10 p-6 sm:border-s sm:border-t-0 sm:p-10">
          <span className="w-fit border border-graphite/15 px-2 py-1 text-xs font-medium uppercase tracking-wider text-ink60">
            {s.galleryFeaturedTag}
          </span>
          <h2 className="text-2xl font-semibold tracking-tight text-graphite">
            {s.galleryFeaturedTitle}
          </h2>
          <p className="text-base leading-relaxed text-ink60">{s.galleryFeaturedDesc}</p>
        </figcaption>
      </figure>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {s.galleryItems.map((item, i) => (
          <figure key={i} className="overflow-hidden border border-graphite/10 bg-white">
            <div className="flex items-center justify-center bg-porcelain p-6">
              <PatternMark variant={VARIANTS[i]} className="w-full" />
            </div>
            <figcaption className="border-t border-graphite/10 p-5">
              <h2 className="text-base font-semibold text-graphite">{item.title}</h2>
              <p className="mt-1 text-sm text-ink60">{item.desc}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="mt-8 text-sm text-mist">{s.galleryDisclaimer}</p>

      <div className="mt-10 text-center">
        <Link
          href="/design"
          className="inline-block rounded-[2px] bg-graphite px-8 py-3.5 text-sm font-semibold text-porcelain transition-colors hover:bg-graphite/90"
        >
          {s.galleryCta}
        </Link>
      </div>
    </div>
  );
}
