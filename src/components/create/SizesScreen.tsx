"use client";

// handoff §3 — מסך אחד, שני מסלולים לפי product. כולל מדריך מדידה ותצוגת רוחב.
import { he } from "@/i18n/he";
import {
  Eyebrow, ScreenTitle, FieldLabel, OptionBtn, Slider, PrimaryBtn, Modal,
} from "./ui";
import { WidthPreview } from "./Artwork";
import { WIDTH, hasExactSize, sizeIssue, type CreateState, type Fit } from "./model";

const d = he.design;

export function SizesScreen({
  s, set, onNext, busy, nextLabel,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onNext: () => void;
  /** ההמשך רץ עכשיו — בהזמנת עיצוב ששותף הוא עובר בשרת ולוקח רגע. */
  busy?: boolean;
  /** נוסח אחר לכפתור. במסלול "להזמין כזה" אחריו אין מסך תיאור. */
  nextLabel?: string;
}) {
  const ring = s.product === "ring";
  const exact = hasExactSize(s);
  const w = ring ? WIDTH.ring : WIDTH.bracelet;
  // מידה שאינה מדידה אפשרית עוצרת כאן. הרגע הזה הוא היחיד שבו אפשר לתקן אותה
  // בלי לזרוק כלום: אחריו היא הופכת לאורך פריסה, לפרומפט ולהדמיה — ומודל
  // התמונה מבצע אותה נאמנה. ראו `sizeIssue` והתיעוד של AP-0077.
  const issue = sizeIssue(s);
  // ההצעה בסנטימטרים מוצגת רק כשהיא באמת מסבירה את המספר שהוקלד: 10 → 100
  // נכנס לטווח, 400 → 4000 לא, ואז המשפט היה ניחוש ולא עזרה. במידה אמריקאית
  // אין סנטימטרים בכלל.
  const cmHint =
    issue?.kind === "circumference" &&
    issue.value * 10 >= issue.lo &&
    issue.value * 10 <= issue.hi
      ? issue.value
      : null;

  return (
    <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-10">
      <div className="grid items-start gap-10 md:grid-cols-[1.3fr_1fr] md:gap-14">
        <div>
          <Eyebrow>{d.sizesEyebrow}</Eyebrow>
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <ScreenTitle>{ring ? d.sizesTitleRing : d.sizesTitleBracelet}</ScreenTitle>
              <p className="text-[15px] text-ink60">{ring ? d.sizesSubRing : d.sizesSubBracelet}</p>
            </div>
            <button
              type="button"
              onClick={() => set({ guideOpen: true })}
              className="text-sm text-lapis underline-offset-4 hover:underline"
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
                {p.id === "medium" && (
                  <div className="mt-1 font-display text-[10px] tracking-[0.12em] text-mist">
                    {d.presetDefaultTag}
                  </div>
                )}
              </OptionBtn>
            ))}
          </div>

          {/* מידה מדויקת */}
          <FieldLabel htmlFor="exact-size">{ring ? d.ringSizeLabel : d.circLabel}</FieldLabel>
          <input
            id="exact-size"
            inputMode="decimal"
            value={ring ? s.ringSize : s.circ}
            onChange={(e) => set(ring ? { ringSize: e.target.value } : { circ: e.target.value })}
            placeholder={ring ? d.ringSizePlaceholder : d.circPlaceholder}
            aria-invalid={issue ? true : undefined}
            className={`w-full rounded-[2px] border bg-white px-4 py-3.5 text-base transition-colors focus:outline-none ${
              issue ? "border-failred" : "border-graphite/20 focus:border-lapis"
            }`}
          />
          {issue ? (
            <p role="alert" className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-failred)" }}>
              {issue.kind === "usSize"
                ? d.sizeUsOutOfRange(issue.value, issue.lo, issue.hi)
                : d.sizeOutOfRange(issue.value, issue.lo, issue.hi)}
              {cmHint !== null && <span className="block">{d.sizeCmHint(cmHint)}</span>}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-ink60">{d.exactOverridesPreset}</p>
          )}

          {/* ישיבה — צמיד בלבד */}
          {!ring && (
            <div className="mt-8">
              <FieldLabel>{d.fitLabel}</FieldLabel>
              <div className="flex gap-3">
                {(Object.keys(d.fits) as Fit[]).map((f) => (
                  <OptionBtn key={f} on={s.fit === f} onClick={() => set({ fit: f })}>
                    <div className="text-sm font-semibold text-graphite">{d.fits[f]}</div>
                    <div className="mt-1 text-xs text-ink60">{d.fitSubs[f]}</div>
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
              className="mt-7 border-s-2 border-lapis bg-white p-4 text-sm leading-relaxed text-ink80"
              style={{ textWrap: "pretty" }}
            >
              {d.ringDisclaimer}
            </p>
          )}

          <div className="mt-9">
            <PrimaryBtn onClick={onNext} disabled={busy || Boolean(issue)}>
              {nextLabel ?? d.sizesContinue}
            </PrimaryBtn>
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
