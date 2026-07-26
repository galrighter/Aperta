"use client";

// handoff §6 — שני מצבי תצוגה, סימון אזורים, בקשה למודל, יומן גרסאות,
// כוונון מהיר ומצב ייצור. מצב הייצור מוזן מדוח הוולידציה האמיתי של המנוע.
import { he } from "@/i18n/he";
import {
  Eyebrow, ScreenTitle, CardLabel, PrimaryBtn, Slider, COBALT,
} from "./ui";
import { FlatDrawing, RegionChips } from "./Artwork";
import { RolledStage } from "./RolledStage";
import {
  activeEntry, cutoutsInner, frameLengthMm, gapOf, widthOf, type CreateState,
} from "./model";

const d = he.design;

export function ResultScreen({
  s, set, onApply, onRestore, onOrder,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onApply: () => void;
  onRestore: (i: number) => void;
  onOrder: () => void;
}) {
  const entry = activeEntry(s);
  const cutouts = cutoutsInner(entry?.svg);
  const L = frameLengthMm(s, entry);
  const W = widthOf(s);
  const report = entry?.report ?? null;
  const flat = s.resultMode === "flat";

  const status = report?.status ?? "pass";
  const statusText =
    status === "pass" ? d.fabOk : status === "warn" ? d.fabWarn : d.fabFail;
  const statusColor =
    status === "pass" ? "#4a8f5c" : status === "warn" ? "#b9762e" : "#c0413b";

  return (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-10">
      <Eyebrow>{d.resultEyebrow}</Eyebrow>
      <ScreenTitle>{s.imageRole === "ready" ? d.resultTitleReady : d.resultTitle}</ScreenTitle>

      {/* מתג מצב תצוגה */}
      <div className="mb-6 mt-6 flex gap-2">
        {([["render", d.modeRender], ["flat", d.modeFlat]] as const).map(([m, label]) => {
          const on = s.resultMode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => set({ resultMode: m })}
              aria-pressed={on}
              className="rounded-[2px] border border-graphite px-[18px] py-2.5 text-sm transition-colors"
              style={{
                background: on ? "#202326" : "transparent",
                color: on ? "#f4f1eb" : "#202326",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className={`grid items-start gap-8 ${flat ? "lg:grid-cols-[1.5fr_1fr]" : "lg:grid-cols-1"}`}>
        {/* ===== תצוגה ===== */}
        <div>
          <div className="border border-graphite/10 bg-white">
            {/* אין תבנית — לומר את זה במפורש במקום להציג פס חלק כאילו זו התוצאה. */}
            {!cutouts ? (
              <div className="px-6 py-16 text-center">
                <div className="mb-2 text-lg font-semibold text-graphite">{d.resultEmptyTitle}</div>
                <p className="mx-auto max-w-[420px] text-sm leading-relaxed text-ink60">
                  {d.resultEmptyBody}
                </p>
              </div>
            ) : flat ? (
              <FlatDrawing
                cutouts={cutouts}
                lengthMm={L}
                widthMm={W}
                region={s.region}
                onRegion={(r) => set({ region: r })}
              />
            ) : (
              <div style={{ background: "linear-gradient(180deg,#efeae1,#e0d9cd)" }}>
                <RolledStage
                  material={entry?.geometry?.material ?? null}
                  cutouts={cutouts}
                  lengthMm={L}
                  widthMm={W}
                  gapMm={gapOf(s)}
                />
              </div>
            )}
          </div>

          {!flat && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
              {d.renderNote}
            </p>
          )}

          {/* סימון אזורים — במצב פריסה */}
          {flat && (
            <div className="mt-4 border border-graphite/10 bg-white p-5">
              <CardLabel>{d.regionTitle}</CardLabel>
              <p className="mb-3.5 text-[13px] text-ink60">{d.regionHint}</p>
              <RegionChips region={s.region} onRegion={(r) => set({ region: r })} />
            </div>
          )}

          {/* בקשה למודל */}
          <div className="mt-4 border border-graphite/10 bg-white p-5">
            <CardLabel>{`${d.editReqTitle} · ${d.regions[s.region ?? "all"]}`}</CardLabel>
            <textarea
              value={s.editReq}
              onChange={(e) => set({ editReq: e.target.value })}
              placeholder={d.editReqPlaceholder}
              className="w-full resize-y rounded-[2px] border border-graphite/20 bg-porcelain p-3.5 text-[15px] leading-relaxed transition-colors focus:border-cobalt focus:outline-none"
              style={{ minHeight: 88 }}
            />
            <div className="mt-3">
              <button
                type="button"
                onClick={onApply}
                disabled={s.applying || !s.editReq.trim()}
                className="rounded-[2px] px-6 py-3 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed"
                style={{ background: s.applying || !s.editReq.trim() ? "rgba(49,91,255,0.35)" : COBALT }}
              >
                {s.applying ? d.editApplying : d.editApply}
              </button>
            </div>
          </div>
        </div>

        {/* ===== צד ===== */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-[104px]">
          {/* מצב ייצור */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.fabTitle}</CardLabel>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusColor }} />
              <span className="text-sm font-semibold" style={{ color: statusColor }}>
                {statusText}
              </span>
            </div>
            <Row k={d.fabOpenArea} v={report ? `${report.metrics.openAreaPct.toFixed(1)}%` : "—"} />
            <Row
              k={d.fabWeight}
              v={report ? `${report.metrics.estWeightGrams.toFixed(1)} ${he.grams}` : "—"}
            />
            <Row k={d.fabFormat} v={d.fabFormatVal} />
            <Row k={d.specCuts} v={String(entry ? countOf(entry.svg) : 0)} />

            {/* ממצאים מהוולידציה */}
            {report && report.checks.some((c) => c.status !== "pass") && (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-graphite/10 pt-3">
                {report.checks
                  .filter((c) => c.status !== "pass")
                  .slice(0, 4)
                  .map((c, i) => (
                    <li key={i} className="text-[13px] leading-snug" style={{ color: c.status === "fail" ? "#c0413b" : "#b9762e" }}>
                      {c.message}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* כוונון מהיר — רק במצב פריסה */}
          {flat && (
            <div className="border border-graphite/10 bg-white p-6">
              <CardLabel>{d.tuneTitle}</CardLabel>
              <div className="flex flex-col gap-5">
                <Slider
                  label={d.tuneDensity}
                  min={4}
                  max={16}
                  value={s.cutDensity}
                  onChange={(v) => set({ cutDensity: v })}
                />
                <Slider
                  label={d.tuneBridge}
                  min={1}
                  max={6}
                  value={s.bridgeMm}
                  onChange={(v) => set({ bridgeMm: v })}
                />
              </div>
            </div>
          )}

          {/* יומן גרסאות */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.versionsTitle}</CardLabel>
            {s.edits.length <= 1 ? (
              <p className="text-[13px] text-ink60">{d.versionsEmpty}</p>
            ) : (
              <ol className="flex flex-col">
                {s.edits.map((e, i) => {
                  const on = (s.activeEdit < 0 ? s.edits.length - 1 : s.activeEdit) === i;
                  return (
                    <li
                      key={e.versionId}
                      className="flex items-start justify-between gap-3 border-b border-graphite/[0.07] py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-graphite">
                          {d.versionLabel} {i + 1}
                          {e.region ? ` · ${d.regions[e.region]}` : ""}
                        </div>
                        <div className="mt-0.5 truncate text-[13px] text-ink60">
                          {e.text || d.versionOriginal}
                        </div>
                      </div>
                      {!on && (
                        <button
                          type="button"
                          onClick={() => onRestore(i)}
                          className="flex-none whitespace-nowrap text-[12px] text-cobalt underline-offset-4 hover:underline"
                        >
                          {d.versionRestore}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <PrimaryBtn onClick={onOrder} full>
            {d.resultOrder}
          </PrimaryBtn>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-graphite/[0.07] py-2.5 text-sm last:border-b-0">
      <span className="text-ink60">{k}</span>
      <span className="font-semibold text-graphite">{v}</span>
    </div>
  );
}

function countOf(svg: string): number {
  const g = /<g id="cutouts"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
  return ((g?.[1] ?? "").match(/<(path|circle|rect|ellipse|polygon)\b/g) ?? []).length;
}
