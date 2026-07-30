"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import { FAB, type FitStyle } from "@/lib/fabrication.config";
import { computeSizing, sizeFromBlank, US_RING_SIZES, US_RING_ID_MM } from "@/lib/sizing";
import { useStudio, currentVersion } from "@/lib/client/store";
import { ConfirmModal } from "./Modal";

const r1 = (v: number) => Math.round(v * 10) / 10;

export function ParamsPanel() {
  const s = useStudio();
  const { design, paramsOpen, setParamsOpen } = s;
  const [pending, setPending] = useState<{ lengthMm?: number; widthMm?: number; gapMm?: number } | null>(null);
  // סגנון ההתאמה אינו נשמר ב-DB — אורך הפריסה הוא מקור האמת, וה-Fit רק
  // הפרמטר שדרכו הלקוח הגיע אליו. מוצג כדי שהקריאה ההפוכה תהיה עקבית.
  const [fit, setFit] = useState<FitStyle>("comfort");
  if (!design) return null;

  const p = FAB.products[design.product_type];
  const hasVersion = currentVersion(s) !== null;
  const isRing = design.product_type === "ring";

  const dims = {
    thicknessMm: Number(design.thickness_mm),
    widthMm: Number(design.width_mm),
    gapChordMm: Number(design.gap_mm),
    product: design.product_type,
  } as const;

  const applyDim = (key: "lengthMm" | "widthMm" | "gapMm", value: number, range: readonly [number, number]) => {
    const clamped = Math.min(range[1], Math.max(range[0], value));
    if (Number.isNaN(clamped)) return;
    const current = { lengthMm: Number(design.length_mm), widthMm: Number(design.width_mm), gapMm: Number(design.gap_mm) };
    if (current[key] === clamped) return;
    const patch = { [key]: clamped };
    if (hasVersion) setPending(patch);
    else void s.updateDims(patch);
  };

  // מידה → אורך פריסה. כל המתמטיקה ב-lib/sizing.ts; כאן רק חיווט.
  const applySize = (opts: { idMm?: number; wristMm?: number; fit?: FitStyle }) => {
    const r = computeSizing({ ...dims, ...opts, fit: opts.fit ?? fit });
    applyDim("lengthMm", r1(r.blankLengthMm), p.lengthRangeMm);
  };

  const derived = sizeFromBlank(Number(design.length_mm), { ...dims, fit });
  const widthAllowance = FAB.widthComfortAllowanceMm(dims.widthMm);

  return (
    <section className="border-b border-graphite/10 bg-white">
      <button
        className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium"
        onClick={() => setParamsOpen(!paramsOpen)}
      >
        <span>
          {he.parameters} · {design.product_type === "ring" ? he.ring : he.bracelet} ·{" "}
          {Number(design.length_mm)}×{Number(design.width_mm)} מ״מ
        </span>
        <span className="text-mist">{paramsOpen ? "▲" : "▼"}</span>
      </button>
      {paramsOpen && (
        <>
        <div className="mx-4 mb-3 rounded-[2px] bg-porcelain p-3">
          <div className="mb-2 text-xs font-medium text-graphite">{he.sizeSection}</div>
          <div className="grid grid-cols-2 gap-3">
            {isRing ? (
              <label className="text-xs text-ink60">
                {he.ringSizeUs}
                <select
                  className="mt-1 w-full rounded-[2px] border border-graphite/20 px-2 py-1.5 text-sm"
                  value={String(derived.usRingSize ?? 7)}
                  onChange={(e) => applySize({ idMm: US_RING_ID_MM[e.target.value] })}
                >
                  {US_RING_SIZES.map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <NumField
                  label={he.wristCm}
                  value={r1((derived.wristMm ?? 165) / 10)}
                  range={[12, 23]}
                  step={0.5}
                  onCommit={(v) => applySize({ wristMm: v * 10 })}
                />
                <label className="text-xs text-ink60">
                  {he.fitStyle}
                  <select
                    className="mt-1 w-full rounded-[2px] border border-graphite/20 px-2 py-1.5 text-sm"
                    value={fit}
                    onChange={(e) => {
                      const next = e.target.value as FitStyle;
                      const wrist = derived.wristMm ?? 165;
                      setFit(next);
                      applySize({ wristMm: wrist, fit: next });
                    }}
                  >
                    <option value="snug">{he.fitSnug}</option>
                    <option value="comfort">{he.fitComfort}</option>
                    <option value="loose">{he.fitLoose}</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px] text-mist">
            {he.derivedSizePrefix}{" "}
            {isRing
              ? `${he.derivedRingSize} ${derived.usRingSize} · ID ${r1(derived.nominalIdMm)} מ״מ`
              : `${he.derivedWrist} ${r1((derived.wristMm ?? 0) / 10)} ${he.cm}`}
          </p>
          {widthAllowance > 0 && (
            <p className="mt-1 text-[11px] text-mist">
              {he.widthAllowanceNote} {widthAllowance} מ״מ
            </p>
          )}
          {isRing && <p className="mt-1 text-[11px] text-graphite">{he.ringNotAdjustable}</p>}
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-mist">{he.measureTipsTitle}</summary>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-mist">
              <li>{he.measureTipEvening}</li>
              <li>{he.measureTipTemp}</li>
              <li>{isRing ? he.measureTipKnuckle : he.measureTipWrist}</li>
            </ul>
          </details>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4">
          <label className="text-xs text-ink60">
            {he.productType}
            <select
              className="mt-1 w-full rounded-[2px] border border-graphite/20 px-2 py-1.5 text-sm"
              value={design.product_type}
              disabled={hasVersion}
              onChange={(e) => {
                // שינוי סוג מוצר רק לעיצוב ריק — יוצר עיצוב חדש במקום
                void s.newDesign(e.target.value as "bracelet" | "ring");
              }}
            >
              <option value="bracelet">{he.bracelet}</option>
              <option value="ring">{he.ring}</option>
            </select>
          </label>
          <NumField
            label={he.lengthMm}
            hint={he.lengthIsDerived}
            value={Number(design.length_mm)}
            range={p.lengthRangeMm}
            onCommit={(v) => applyDim("lengthMm", v, p.lengthRangeMm)}
          />
          <NumField
            label={he.widthMm}
            value={Number(design.width_mm)}
            range={p.widthRangeMm}
            onCommit={(v) => applyDim("widthMm", v, p.widthRangeMm)}
          />
          <NumField
            label={he.gapMm}
            value={Number(design.gap_mm)}
            range={p.gapRangeMm}
            onCommit={(v) => applyDim("gapMm", v, p.gapRangeMm)}
          />
        </div>
        </>
      )}
      <ConfirmModal
        open={pending !== null}
        title={he.dimsChangeTitle}
        body={he.dimsChangeBody}
        onConfirm={() => {
          if (pending) void s.updateDims(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}

function NumField(props: {
  label: string;
  value: number;
  range: readonly [number, number];
  step?: number;
  hint?: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="text-xs text-ink60" title={props.hint}>
      {props.label}
      <input
        type="number"
        inputMode="decimal"
        step={props.step}
        min={props.range[0]}
        max={props.range[1]}
        className="mt-1 w-full rounded-[2px] border border-graphite/20 px-2 py-1.5 text-sm"
        value={draft ?? String(props.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) props.onCommit(parseFloat(draft));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="text-[10px] text-mist">
        {props.range[0]}–{props.range[1]}
      </span>
    </label>
  );
}
