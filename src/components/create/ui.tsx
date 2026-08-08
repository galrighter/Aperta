"use client";

// פרימיטיבים משותפים למסע היצירה. טוקנים: handoff §10.
import { useId } from "react";
import { he } from "@/i18n/he";
import { useDialog } from "@/lib/client/useDialog";
import { RAIL, type Screen } from "./model";

const d = he.design;

export const LAPIS = "#3f6297";
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

// שתי הכותרות למטה מקבלות `htmlFor` אופציונלי, ואז הן `<label>` אמיתי ולא
// `<div>` שנראה כמו אחד. בלי הקישור הזה השדות המרכזיים במשפך היו מתויגים
// לקורא-מסך דרך ה-placeholder בלבד — שנעלם ברגע שמתחילים להקליד, כלומר בדיוק
// כשמישהי חוזרת לשאול "מה הוקלד כאן". הקישור גם עושה את הכותרת לחיצה.

export function CardLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const cls = "mb-4 font-display text-xs tracking-[0.15em] text-mist";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={`block ${cls}`}>{children}</label>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const cls = "mb-3 text-sm font-semibold text-ink60";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={`block ${cls}`}>{children}</label>
  ) : (
    <div className={cls}>{children}</div>
  );
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
        border: `1.5px solid ${on ? LAPIS : "rgba(32,35,38,0.2)"}`,
        background: on ? "rgba(63,98,151,0.06)" : "#fff",
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
        border: `1px solid ${on ? LAPIS : "rgba(32,35,38,0.2)"}`,
        background: on ? LAPIS : "#fff",
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
        style={{ accentColor: LAPIS }}
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
  label, value, onChange, placeholder, type = "text", required, inputMode, dir,
  onBlur, autoComplete, error, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
  /** לקוד חד־פעמי: מקלדת ספרות בנייד, ומספרים שנקראים משמאל לימין. */
  inputMode?: "numeric" | "tel" | "email" | "text";
  dir?: "ltr" | "rtl";
  onBlur?: () => void;
  /** ערך `autocomplete` של HTML — מה שמאפשר לדפדפן למלא את השדה. */
  autoComplete?: string;
  /** שגיאת ולידציה על השדה הזה. מוצגת מתחתיו, ומסומנת גם לקורא־מסך. */
  error?: string | null;
  /** הסבר קבוע מתחת לשדה. נבלע כשיש שגיאה — שתי שורות אינן עוזרות לאף אחד. */
  hint?: string | null;
}) {
  // מזהה יציב לקישור `aria-describedby`. השגיאה מוצגת ויזואלית מתחת לשדה,
  // ובלי הקישור הזה קורא־מסך היה מקריא שדה "לא תקין" בלי לומר למה.
  const id = useId();
  const msg = error || hint || null;

  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-ink60">
        {label}
        {required && <span className="text-lapis"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        inputMode={inputMode}
        dir={dir}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={msg ? `${id}-msg` : undefined}
        className={`w-full rounded-[2px] border bg-white px-4 py-3 text-base transition-colors focus:outline-none ${
          error ? "border-[#c0413b] focus:border-[#c0413b]" : "border-graphite/20 focus:border-lapis"
        }`}
      />
      {msg && (
        <span
          id={`${id}-msg`}
          role={error ? "alert" : undefined}
          className={`mt-1.5 block text-[12px] ${error ? "text-[#c0413b]" : "text-ink60"}`}
        >
          {msg}
        </span>
      )}
    </label>
  );
}

/**
 * תיבת סימון.
 *
 * `<button aria-pressed>` ולא `<input type=checkbox>` מעוצב: הריבוע כאן הוא
 * 20px עם סימן שמצויר בתוכו, ו-input אמיתי היה דורש להסתיר אותו ולצייר מעליו —
 * כלומר בדיוק אותו אלמנט, עם עוד שכבה שיכולה להתפרק. התווית לחיצה יחד איתו,
 * ומכילה קישורים (התנאים) — ולכן היא ליד הכפתור ולא בתוכו.
 */
export function CheckBox({
  on, onChange, children,
}: {
  on: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-[2px] text-xs text-porcelain transition-colors"
        style={{
          border: `1.5px solid ${on ? LAPIS : "rgba(32,35,38,0.3)"}`,
          background: on ? LAPIS : "#fff",
        }}
      >
        {on ? "✓" : ""}
      </button>
      <span className="text-[13px] leading-relaxed text-ink80">{children}</span>
    </div>
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
      // נעצר מתחת לכותרת ולא מאחוריה: שתיהן היו sticky top-0, וברגע שגללו
      // הסרגל נעלם מתחת לכותרת השקופה למחצה — שתי שורות במקום אחת, ואף אחת
      // מהן לא קריאה. הגובה מגיע כמשתנה שהכותרת מודדת על עצמה.
      style={{ top: "var(--ap-header-h, 0px)" }}
      className="sticky z-10 flex items-center gap-2 overflow-x-auto border-b border-graphite/[0.08] bg-porcelain/92 px-5 py-4 backdrop-blur sm:px-10"
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
                  border: `1.5px solid ${active ? LAPIS : done ? GRAPHITE : "#aab4b8"}`,
                  background: active ? LAPIS : done ? GRAPHITE : "transparent",
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
  // Escape והמיקוד גם יחד — ראה useDialog. הכליאה חסרה כאן: Tab יצא מהחלון
  // אל הטופס שמאחוריו, וקורא-מסך המשיך להקריא עמוד שכבר מכוסה.
  const box = useDialog(open, onClose);

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
        ref={box}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-graphite/15 bg-white p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-xl font-semibold text-graphite">{title}</h2>
        {children}
      </div>
    </div>
  );
}
