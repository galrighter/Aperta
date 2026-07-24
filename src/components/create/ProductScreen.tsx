"use client";

// handoff §2 — שני כרטיסים; בחירה מגדירה product ומנתבת ישירות למידות.
import { he } from "@/i18n/he";
import { Eyebrow, ScreenTitle } from "./ui";
import type { Product } from "./model";

const d = he.design;

export function ProductScreen({ onPick }: { onPick: (p: Product) => void }) {
  return (
    <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-10">
      <Eyebrow>{d.productEyebrow}</Eyebrow>
      <ScreenTitle>{d.productTitle}</ScreenTitle>
      <p className="mb-10 max-w-[520px] text-[17px] text-ink60">{d.productSubtitle}</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Item
          onClick={() => onPick("bracelet")}
          img="/bracelet-hero.png"
          objectPosition="center 62%"
          name={d.braceletName}
          price={d.braceletPrice}
          desc={d.braceletDesc}
          meta={d.braceletMeta}
        />
        <Item
          onClick={() => onPick("ring")}
          img="/ring-brass.png"
          objectPosition="center 55%"
          name={d.ringName}
          price={d.ringPrice}
          desc={d.ringDesc}
          meta={d.ringMeta}
        />
      </div>
    </section>
  );
}

function Item({
  onClick, img, objectPosition, name, price, desc, meta,
}: {
  onClick: () => void; img: string; objectPosition: string;
  name: string; price: string; desc: string; meta: readonly string[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block border border-graphite/[0.16] bg-white text-start transition-all hover:-translate-y-[3px] hover:border-cobalt"
    >
      <div className="overflow-hidden border-b border-graphite/10" style={{ aspectRatio: "16 / 10" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={name} className="h-full w-full object-cover" style={{ objectPosition }} />
      </div>
      <div className="p-[26px]">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <div className="text-[22px] font-semibold text-graphite">{name}</div>
          <div className="whitespace-nowrap font-display text-sm text-cobalt">{price}</div>
        </div>
        <p className="mb-4 text-[15px] text-ink60">{desc}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink60">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
    </button>
  );
}
