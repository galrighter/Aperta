"use client";

// handoff §7 — סקיצה פרוסה, מפרט, דיסקליימרים, מחיר, וצ'קבוקס תנאים חוסם.
import { he } from "@/i18n/he";
import { Eyebrow, ScreenTitle, CardLabel, PrimaryBtn, COBALT } from "./ui";
import {
  activeEntry, circumferenceMm, countCuts, cutoutsInner, frameLengthMm,
  frameWidthMm, mmLabel, priceOf, type CreateState,
} from "./model";

const d = he.design;

export function SummaryScreen({
  s, set, onNext,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onNext: () => void;
}) {
  const entry = activeEntry(s);
  const cutouts = cutoutsInner(entry?.svg);
  const L = frameLengthMm(s, entry);
  const W = frameWidthMm(s, entry);
  const p = priceOf(s);
  const ring = s.product === "ring";
  const cuts = countCuts(entry?.svg ?? null);

  const source =
    s.imageRole === "ready" ? d.sources.ready
      : s.imageRole === "sketch" ? d.sources.sketch
      : s.imageRole === "inspiration" ? d.sources.inspiration
      : d.sources.brief;

  return (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-10">
      <Eyebrow>{d.summaryEyebrow}</Eyebrow>
      <ScreenTitle>{d.summaryTitle}</ScreenTitle>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {/* סקיצה פרוסה */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.sketchTitle}</CardLabel>
            <div className="overflow-hidden px-1 py-6">
              <svg viewBox={`-2 -2 ${L + 4} ${W + 4}`} className="h-auto w-full" role="img" aria-label={d.sketchTitle}>
                <rect
                  x="0" y="0" width={L} height={W}
                  fill="none" stroke="rgba(32,35,38,0.35)" strokeWidth={Math.max(0.25, W / 90)}
                />
                {cutouts && (
                  <g
                    fill="none" stroke={COBALT}
                    strokeWidth={Math.max(0.2, W / 110)} strokeLinejoin="round"
                    dangerouslySetInnerHTML={{ __html: cutouts }}
                  />
                )}
              </svg>
            </div>
          </div>

          {/* מפרט */}
          <div className="mt-4 border border-graphite/10 bg-white p-6">
            <CardLabel>{d.specTitle}</CardLabel>
            <Row k={d.specKeys.type} v={ring ? d.ringName : d.braceletName} />
            <Row k={d.specKeys.size} v={`${Math.round(circumferenceMm(s))} ${d.mm}`} />
            <Row k={d.specKeys.width} v={`${mmLabel(W)} ${d.mm}`} />
            <Row k={d.specKeys.fit} v={ring ? d.ringFitVal : d.fits[s.fit]} />
            <Row k={d.specKeys.material} v={d.specMaterial} />
            <Row k={d.specKeys.thickness} v={d.specThickness} />
            <Row k={d.specKeys.finish} v={d.specFinish} />
            <Row k={d.specKeys.source} v={source} />
            <Row k={d.specKeys.file} v={`${d.specFileVal} · ${cuts} ${d.specCuts}`} />
          </div>

          {/* דיסקליימרים */}
          <div className="mt-4 border border-graphite/10 bg-white p-6">
            <CardLabel>{d.disclaimersTitle}</CardLabel>
            <ul className="flex flex-col gap-2.5">
              {d.disclaimers.map((t, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink80">
                  <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-mist" />
                  <span style={{ textWrap: "pretty" }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* מחיר */}
        <div className="lg:sticky lg:top-[104px]">
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.priceTitle}</CardLabel>
            <PriceRow k={d.priceBase} v={p.base} />
            <PriceRow k={d.priceWidth} v={p.widthAdd} />
            <PriceRow k={d.priceComplexity} v={p.complexity} />
            <PriceRow k={d.priceShipping} v={p.shipping} />
            <div className="mt-2 flex items-baseline justify-between border-t border-graphite/15 pt-3.5">
              <span className="text-base font-semibold text-graphite">{d.priceTotal}</span>
              <span className="font-display text-2xl font-bold text-graphite">
                {d.ils}{p.total}
              </span>
            </div>
            {/* המע"מ כלול בסכום ולכן הוא יושב מתחתיו כשורת מידע, לא מעליו
                כשורת תוספת: מה שמוצג הוא מה שמשלמים. */}
            <div className="mt-1 flex items-baseline justify-between text-[13px] text-mist">
              <span>{d.priceVat}</span>
              <span>{d.ils}{p.vat}</span>
            </div>

            {/* אישור תנאים — חוסם */}
            <button
              type="button"
              onClick={() => set({ terms: !s.terms })}
              className="mt-6 flex w-full items-start gap-3 text-start"
              aria-pressed={s.terms}
            >
              <span
                className="mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[2px] text-[13px] text-white"
                style={{
                  border: `1.5px solid ${s.terms ? COBALT : "rgba(32,35,38,0.3)"}`,
                  background: s.terms ? COBALT : "#fff",
                }}
              >
                {s.terms ? "✓" : ""}
              </span>
              <span className="text-sm leading-relaxed text-ink80" style={{ textWrap: "pretty" }}>
                {d.termsLabel}
              </span>
            </button>

            <div className="mt-5">
              <PrimaryBtn onClick={onNext} disabled={!s.terms} full>
                {d.summaryContinue}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-graphite/[0.07] py-2.5 text-sm last:border-b-0">
      <span className="flex-none text-ink60">{k}</span>
      <span className="text-end font-semibold text-graphite">{v}</span>
    </div>
  );
}

function PriceRow({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between py-[7px] text-sm text-ink60">
      <span>{k}</span>
      <span>{d.ils}{v}</span>
    </div>
  );
}
