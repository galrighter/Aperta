"use client";

// handoff §3 — מסך אחד, שני מסלולים לפי product. כולל מדריך מדידה ותצוגת רוחב.
import { he } from "@/i18n/he";
import {
  Eyebrow, ScreenTitle, FieldLabel, OptionBtn, Slider, PrimaryBtn, Modal,
} from "./ui";
import { WidthPreview } from "./Artwork";
import { WIDTH, hasExactSize, type CreateState, type Fit } from "./model";

const d = he.design;

export function SizesScreen({
  s, set, onNext,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onNext: () => void;
}) {
  const ring = s.product === "ring";
  const exact = hasExactSize(s);
  const w = ring ? WIDTH.ring : WIDTH.bracelet;

  return (
    <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-10">
      <div className="grid items-start gap-10 md:grid-cols-[1.3fr_1fr] md:gap-14">
        <div>
          <Eyebrow>{d.sizesEyebrow}</Eyebrow>
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <ScreenTitle>{ring ? d.sizesTitleRing : d.sizesTitleBracelet}</ScreenTitle>
            <button
              type="button"
              onClick={() => set({ guideOpen: true })}
              className="text-sm text-cobalt underline-offset-4 hover:underline"
            >
              {ring ? d.sizesGuideBtnRing : d.sizesGuideBtn}
            </button>
          </div>

          {/* מידה סטנדרטית */}
          <FieldLabel>{ring ? d.ringPresetLabel : d.wristPresetLabel}</FieldLabel>
          <div className="mb-7 flex gap-3">
            {(ring ? d.ringPresets : d.wristPresets).map((p) => (
              <OptionBtn
                key={p.id}
                on={!exact && (ring ? s.ringPreset : s.wristPreset) === p.id}
                onClick={() =>
                  set(ring
                    ? { ringPreset: p.id, ringSize: "" }
                    : { wristPreset: p.id, circ: "" })
                }
              >
                <div className="font-display text-lg font-semibold text-graphite">{p.name}</div>
                <div className="mt-1 text-xs text-ink60">{p.sub}</div>
              </OptionBtn>
            ))}
          </div>

          {/* מידה מדויקת */}
          <FieldLabel>{ring ? d.ringSizeLabel : d.circLabel}</FieldLabel>
          <input
            inputMode="decimal"
            value={ring ? s.ringSize : s.circ}
            onChange={(e) => set(ring ? { ringSize: e.target.value } : { circ: e.target.value })}
            placeholder={ring ? d.ringSizePlaceholder : d.circPlaceholder}
            className="w-full rounded-[2px] border border-graphite/20 bg-white px-4 py-3.5 text-base transition-colors focus:border-cobalt focus:outline-none"
          />
          <p className="mt-2 text-[13px] text-ink60">{d.exactOverridesPreset}</p>

          {/* ישיבה — צמיד בלבד */}
          {!ring && (
            <div className="mt-8">
              <FieldLabel>{d.fitLabel}</FieldLabel>
              <div className="flex gap-3">
                {(Object.keys(d.fits) as Fit[]).map((f) => (
                  <OptionBtn key={f} on={s.fit === f} onClick={() => set({ fit: f })}>
                    <span className="text-sm text-graphite">{d.fits[f]}</span>
                  </OptionBtn>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-ink60">{d.noAllowanceNote}</p>
            </div>
          )}

          {/* רוחב */}
          <div className="mt-8">
            <Slider
              label={ring ? d.ringWidthLabel : d.braceletWidthLabel}
              min={w.min}
              max={w.max}
              value={ring ? s.ringWidth : s.braceletWidth}
              onChange={(v) => set(ring ? { ringWidth: v } : { braceletWidth: v })}
            />
          </div>

          {/* דיסקליימר טבעת — מוצג תמיד */}
          {ring && (
            <p
              className="mt-7 border-s-2 border-cobalt bg-white p-4 text-sm leading-relaxed text-ink80"
              style={{ textWrap: "pretty" }}
            >
              {d.ringDisclaimer}
            </p>
          )}

          <div className="mt-9">
            <PrimaryBtn onClick={onNext}>{d.sizesContinue}</PrimaryBtn>
          </div>
        </div>

        {/* תצוגת רוחב — פאנל דביק */}
        <div className="md:sticky md:top-[104px]">
          <div className="border border-graphite/10 bg-white p-6">
            <div className="mb-4 font-display text-xs tracking-[0.15em] text-mist">
              {d.widthPreviewTitle}
            </div>
            <WidthPreview
              product={ring ? "ring" : "bracelet"}
              widthMm={ring ? s.ringWidth : s.braceletWidth}
            />
          </div>
        </div>
      </div>

      <MeasureGuide open={s.guideOpen} ring={ring} onClose={() => set({ guideOpen: false })} />
    </section>
  );
}

function MeasureGuide({
  open, ring, onClose,
}: {
  open: boolean; ring: boolean; onClose: () => void;
}) {
  const steps = ring ? d.guideStepsRing : d.guideStepsBracelet;
  const note = ring ? d.guideNoteRing : d.guideNoteBracelet;
  return (
    <Modal open={open} onClose={onClose} title={ring ? d.guideTitleRing : d.guideTitleBracelet}>
      <ol className="flex flex-col gap-4">
        {steps.map((t, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-graphite/25 font-display text-xs font-semibold text-graphite">
              {i + 1}
            </span>
            <span className="text-[15px] leading-relaxed text-ink80">{t}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 border-t border-graphite/10 pt-4 text-sm text-ink60">{note}</p>
      <div className="mt-6">
        <PrimaryBtn onClick={onClose} full>
          {d.guideClose}
        </PrimaryBtn>
      </div>
    </Modal>
  );
}
