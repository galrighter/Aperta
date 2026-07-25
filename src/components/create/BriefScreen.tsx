"use client";

// handoff §4 — מאפיינים, תמונה עם תפקיד, תיאור חופשי.
// כלל קריטי (§4.2): "קובץ מוכן לחיתוך" מנטרל את המאפיינים ואת התיאור.
import { useRef } from "react";
import { he } from "@/i18n/he";
import {
  Eyebrow, ScreenTitle, CardLabel, Chip, ChipRow, PrimaryBtn,
} from "./ui";
import type {
  CreateState, Density, Feel, ImageRole, Symmetry,
} from "./model";

const d = he.design;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function BriefScreen({
  s, set, onSubmit,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onSubmit: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = s.imageRole === "ready";
  const canSubmit = Boolean(s.brief.trim() || s.image || locked);

  const pickFile = (f: File | undefined) => {
    if (!f || f.size > MAX_IMAGE_BYTES) return;
    const reader = new FileReader();
    reader.onload = () =>
      set({
        image: { dataUrl: String(reader.result), name: f.name },
        imageRole: s.imageRole ?? "inspiration",
      });
    reader.readAsDataURL(f);
  };

  return (
    <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-10">
      <Eyebrow>{d.briefEyebrow}</Eyebrow>
      <ScreenTitle>{d.briefTitle}</ScreenTitle>
      <p className="mb-10 max-w-[560px] text-[17px] text-ink60">{d.briefSubtitle}</p>

      <div className="grid items-start gap-9 md:grid-cols-[1.15fr_1fr]">
        {/* ===== תמונה + תיאור ===== */}
        <div>
          {/* תמונה */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.imageTitle}</CardLabel>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />

            {!s.image ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-[2px] border border-dashed border-graphite/35 bg-white px-[22px] py-3.5 text-[15px] text-graphite transition-colors hover:border-cobalt hover:text-cobalt"
                >
                  {d.imageUpload}
                </button>
                <span className="text-[13px] text-mist">{d.imageFormats}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 flex-none overflow-hidden border border-graphite/15 bg-porcelain">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.image.dataUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-graphite">{s.image.name}</div>
                    <button
                      type="button"
                      onClick={() => set({ image: null, imageRole: null })}
                      className="mt-1 text-[13px] text-ink60 underline-offset-4 hover:underline"
                    >
                      {d.imageRemove}
                    </button>
                  </div>
                </div>

                {/* תפקיד התמונה */}
                <div className="mt-6">
                  <div className="mb-3 text-[13px] font-semibold text-ink60">{d.imageRoleTitle}</div>
                  <div className="flex flex-col gap-2.5">
                    {(Object.keys(d.imageRoles) as ImageRole[]).map((r) => {
                      const on = s.imageRole === r;
                      const info = d.imageRoles[r];
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => set({ imageRole: r })}
                          aria-pressed={on}
                          className="rounded-[2px] p-3.5 text-start transition-colors"
                          style={{
                            border: `1.5px solid ${on ? "#315bff" : "rgba(32,35,38,0.18)"}`,
                            background: on ? "rgba(49,91,255,0.06)" : "#fff",
                          }}
                        >
                          <div className="text-sm font-semibold text-graphite">{info.name}</div>
                          <div className="mt-0.5 text-[13px] text-ink60">{info.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* הערת נעילה */}
          {locked && (
            <p className="mt-4 border-s-2 border-cobalt bg-white p-4 text-sm leading-relaxed text-ink80">
              {d.readyLockNote}
            </p>
          )}

          {/* תיאור חופשי */}
          <div
            className="mt-4 transition-opacity"
            style={{ opacity: locked ? 0.35 : 1 }}
            aria-hidden={locked}
            {...(locked ? { inert: "" as unknown as boolean } : {})}
          >
            <div className="border border-graphite/10 bg-white p-6">
              <CardLabel>{d.briefLabel}</CardLabel>
              <textarea
                value={s.brief}
                onChange={(e) => set({ brief: e.target.value })}
                placeholder={d.briefPlaceholder}
                disabled={locked}
                className="w-full resize-y rounded-[2px] border border-graphite/20 bg-white p-4 text-base leading-relaxed transition-colors focus:border-cobalt focus:outline-none disabled:cursor-not-allowed"
                style={{ minHeight: 150 }}
              />
              <p className="mt-3 text-[13px] leading-relaxed text-ink60">{d.briefHint}</p>
            </div>
          </div>
        </div>

        {/* ===== מאפיינים ===== */}
        <div className="md:sticky md:top-[104px]">
          <div
            className="border border-graphite/10 bg-white p-6 transition-opacity"
            style={{ opacity: locked ? 0.35 : 1 }}
            aria-hidden={locked}
          >
            <CardLabel>{d.attrsTitle}</CardLabel>

            <ChipRow label={d.symmetryLabel}>
              {(Object.keys(d.syms) as Symmetry[]).map((v) => (
                <Chip key={v} on={s.symmetry === v} disabled={locked} onClick={() => set({ symmetry: v })}>
                  {d.syms[v]}{v === "symmetric" ? " ·" : ""}
                </Chip>
              ))}
            </ChipRow>

            <ChipRow label={d.densityLabel}>
              {(Object.keys(d.densities) as Density[]).map((v) => (
                <Chip key={v} on={s.density === v} disabled={locked} onClick={() => set({ density: v })}>
                  {d.densities[v]}{v === "medium" ? " ·" : ""}
                </Chip>
              ))}
            </ChipRow>

            <ChipRow label={d.feelLabel}>
              {(Object.keys(d.feels) as Feel[]).map((v) => (
                <Chip key={v} on={s.feel === v} disabled={locked} onClick={() => set({ feel: v })}>
                  {d.feels[v]}{v === "balanced" ? " ·" : ""}
                </Chip>
              ))}
            </ChipRow>

            <p className="mt-1 text-[12px] leading-relaxed text-mist">
              {locked ? d.readyLockNote : d.attrsDefaultNote}
            </p>
          </div>

          <div className="mt-6">
            <PrimaryBtn onClick={onSubmit} disabled={!canSubmit} full>
              {d.briefSubmit}
            </PrimaryBtn>
            {!canSubmit && (
              <p className="mt-2.5 text-center text-[13px] text-mist">{d.briefBlocked}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
