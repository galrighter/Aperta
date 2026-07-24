"use client";

// פרימיטיבים משותפים למסע היצירה. טוקנים: handoff §10.
import { useEffect } from "react";
import { he } from "@/i18n/he";
import { RAIL, type Screen } from "./model";

const d = he.design;

export const COBALT = "#315bff";
export const GRAPHITE = "#202326";
export const PORCELAIN = "#f4f1eb";

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 font-display text-xs tracking-[0.22em] text-mist">{children}</div>;
}

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-2 text-[30px] font-semibold tracking-tight text-graphite sm:text-[38px]">
      {children}
    </h1>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 font-display text-xs tracking-[0.15em] text-mist">{children}</div>;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-sm font-semibold text-ink60">{children}</div>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-graphite/10 bg-white p-6 ${className}`}>{children}</div>
  );
}

export function PrimaryBtn({
  children, onClick, disabled, type = "button", full,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[2px] px-[34px] py-3.5 text-base font-semibold text-porcelain transition-colors ${
        full ? "w-full" : ""
      } ${disabled ? "cursor-not-allowed bg-graphite/25" : "bg-graphite hover:bg-graphite/90"}`}
    >
      {children}
    </button>
  );
}

export function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[2px] border border-graphite/25 px-[22px] py-3 text-sm text-graphite transition-colors hover:bg-porcelain"
    >
      {children}
    </button>
  );
}

/** כפתור בחירה מלבני (מידה סטנדרטית / תפקיד תמונה). */
export function OptionBtn({
  on, onClick, children, disabled,
}: {
  on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="flex-1 rounded-[2px] p-[15px] text-center transition-colors disabled:cursor-not-allowed"
      style={{
        border: `1.5px solid ${on ? COBALT : "rgba(32,35,38,0.2)"}`,
        background: on ? "rgba(49,91,255,0.06)" : "#fff",
      }}
    >
      {children}
    </button>
  );
}

/** צ'יפ קומפקטי לקבוצת מאפיין. */
export function Chip({
  on, onClick, children, disabled,
}: {
  on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="flex-1 rounded-[2px] p-[9px] text-center text-[13px] transition-colors disabled:cursor-not-allowed"
      style={{
        border: `1px solid ${on ? COBALT : "rgba(32,35,38,0.2)"}`,
        background: on ? COBALT : "#fff",
        color: on ? "#fff" : GRAPHITE,
      }}
    >
      {children}
    </button>
  );
}

export function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2.5 text-[13px] font-semibold text-ink60">{label}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export function Slider({
  label, min, max, step = 1, value, onChange,
}: {
  label: string; min: number; max: number; step?: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink60">{label}</span>
        <span className="font-display text-sm font-semibold text-graphite">
          {value} {d.mm}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="mb-1 w-full"
        style={{ accentColor: COBALT }}
        aria-label={label}
      />
      <div className="flex justify-between font-mono text-[11px] text-mist">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function TextInput({
  label, value, onChange, placeholder, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-ink60">
        {label}
        {required && <span className="text-cobalt"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[2px] border border-graphite/20 bg-white px-4 py-3 text-base transition-colors focus:border-cobalt focus:outline-none"
      />
    </label>
  );
}

/* ===== סרגל שלבים (handoff §1) ===== */

export function StepRail({
  screen, maxReached, onGo,
}: {
  screen: Screen; maxReached: number; onGo: (i: number) => void;
}) {
  const cur = RAIL.findIndex((r) => r.screens.includes(screen));
  return (
    <nav
      aria-label={d.stepAria}
      className="sticky top-0 z-20 flex items-center gap-2 overflow-x-auto border-b border-graphite/[0.08] bg-porcelain/92 px-5 py-4 backdrop-blur sm:px-10"
    >
      {RAIL.map((r, i) => {
        const done = cur > i;
        const active = cur === i;
        const locked = i > maxReached;
        return (
          <div key={r.key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !locked && onGo(i)}
              disabled={locked}
              title={locked ? d.stepLocked : undefined}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed"
              style={{ opacity: locked ? 0.4 : 1 }}
            >
              <span
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full font-display text-xs font-semibold"
                style={{
                  border: `1.5px solid ${active ? COBALT : done ? GRAPHITE : "#aab4b8"}`,
                  background: active ? COBALT : done ? GRAPHITE : "transparent",
                  color: active || done ? PORCELAIN : "#aab4b8",
                }}
              >
                {i + 1}
              </span>
              <span
                className="text-[13px] tracking-[0.02em]"
                style={{ fontWeight: active ? 600 : 400 }}
              >
                {d.steps[r.key]}
              </span>
            </button>
            {i < RAIL.length - 1 && <span className="h-px w-[22px] bg-graphite/20" />}
          </div>
        );
      })}
    </nav>
  );
}

/* ===== מודאל ===== */

export function Modal({
  open, onClose, title, children,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-graphite/15 bg-white p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-xl font-semibold text-graphite">{title}</h2>
        {children}
      </div>
    </div>
  );
}
