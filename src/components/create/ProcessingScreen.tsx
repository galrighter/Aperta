"use client";

// handoff §5 — מסך עיבוד. הפרוגרס אמיתי-למראה אך ההמתנה היא לתשובת המנוע
// (לא טיימר, כנדרש ב-§5). מצב הכשל נוסף כאן — §11.2 מסמן אותו כחסר.
import { useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { GhostBtn, PrimaryBtn } from "./ui";

const d = he.design;
const QUOTE_MS = 3200;

export function ProcessingScreen({
  error, onRetry, onBack,
}: {
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [qi, setQi] = useState(0);
  const [fade, setFade] = useState(true);
  const [progress, setProgress] = useState(4);

  // החלפת ציטוטים כל 3.2 שניות עם fade
  useEffect(() => {
    if (error) return;
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setQi((i) => (i + 1) % d.procQuotes.length);
        setFade(true);
      }, 320);
    }, QUOTE_MS);
    return () => clearInterval(t);
  }, [error]);

  // התקדמות אסימפטוטית עד 96% — מושלמת ל-100% רק כשהמנוע חוזר
  useEffect(() => {
    if (error) return;
    const t = setInterval(() => setProgress((p) => (p >= 96 ? 96 : p + (96 - p) * 0.035 + 0.35)), 240);
    return () => clearInterval(t);
  }, [error]);

  if (error) {
    return (
      <section className="mx-auto flex max-w-[620px] flex-col items-center px-5 py-24 text-center sm:px-10">
        <div
          className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border-2 border-graphite/25 font-display text-2xl text-graphite"
          aria-hidden="true"
        >
          !
        </div>
        <h1 className="mb-3 text-[26px] font-semibold tracking-tight text-graphite sm:text-[32px]">
          {d.procErrorTitle}
        </h1>
        <p className="mb-3 text-[17px] leading-relaxed text-ink60">{d.procErrorBody}</p>
        <p className="mb-9 font-mono text-[13px] text-mist">{error}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <PrimaryBtn onClick={onRetry}>{d.procRetry}</PrimaryBtn>
          <GhostBtn onClick={onBack}>{d.procBack}</GhostBtn>
        </div>
      </section>
    );
  }

  const q = d.procQuotes[qi];

  return (
    <section className="mx-auto flex max-w-[620px] flex-col items-center px-5 py-24 text-center sm:px-10">
      <h1 className="mb-4 text-[26px] font-semibold tracking-tight text-graphite sm:text-[32px]">
        {d.procTitle}
      </h1>
      <p className="mb-10 text-[16px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
        {d.procBody}
      </p>

      {/* פס התקדמות */}
      <div
        className="mb-12 h-[3px] w-full overflow-hidden bg-graphite/12"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-cobalt transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ציטוט מתחלף */}
      <blockquote
        className="transition-opacity duration-300"
        style={{ opacity: fade ? 1 : 0 }}
      >
        <p className="text-[19px] leading-relaxed text-graphite" style={{ textWrap: "balance" }}>
          {q.text}
        </p>
        <footer className="mt-3 font-display text-xs tracking-[0.2em] text-mist">{q.by}</footer>
      </blockquote>
    </section>
  );
}
