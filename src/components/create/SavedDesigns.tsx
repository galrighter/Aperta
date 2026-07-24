"use client";

// "העיצובים שלי" — תוספת מעבר ל-handoff. מוצג מעל בחירת המוצר כשיש מה להמשיך.
import { he } from "@/i18n/he";
import { COBALT } from "./ui";
import type { SavedDesign } from "@/lib/client/myDesigns";

const d = he.design;

export function SavedDesigns({
  items, onResume, onRemove, loadingId, error,
}: {
  items: SavedDesign[];
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
  loadingId: string | null;
  error: string | null;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-12 border border-graphite/10 bg-white p-6">
      <div className="mb-1 font-display text-xs tracking-[0.15em] text-mist">{d.savedTitle}</div>
      <p className="mb-5 text-sm text-ink60">{d.savedSubtitle}</p>

      {error && <p className="mb-4 text-[13px] text-[#c0413b]">{error}</p>}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <li key={it.id} className="flex flex-col border border-graphite/[0.14] bg-porcelain">
            {/* תצוגה מקדימה מהגאומטריה השמורה */}
            <div className="flex h-[74px] items-center justify-center overflow-hidden border-b border-graphite/10 bg-white px-3">
              {it.path && it.lengthMm ? (
                <svg
                  viewBox={`-1 -1 ${it.lengthMm + 2} ${it.widthMm + 2}`}
                  className="h-auto w-full"
                  role="img"
                  aria-label={it.name}
                >
                  <rect
                    x="0" y="0" width={it.lengthMm} height={it.widthMm}
                    fill="none" stroke="rgba(32,35,38,0.3)" strokeWidth={Math.max(0.2, it.widthMm / 90)}
                  />
                  <path
                    d={it.path} fillRule="evenodd" fill="none"
                    stroke={COBALT} strokeWidth={Math.max(0.2, it.widthMm / 110)}
                  />
                </svg>
              ) : (
                <span className="font-mono text-[11px] text-mist">{d.savedTitle}</span>
              )}
            </div>

            <div className="flex flex-1 flex-col p-4">
              <div className="text-sm font-semibold text-graphite">
                {it.product === "ring" ? he.ring : he.bracelet} · {it.circMm} {d.mm}
              </div>
              <div className="mt-0.5 text-[12px] text-ink60">
                {it.widthMm} {d.mm} · {it.cuts} {d.savedCuts}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onResume(it.id)}
                  disabled={loadingId === it.id}
                  className="text-[13px] font-semibold text-cobalt underline-offset-4 hover:underline disabled:opacity-60"
                >
                  {loadingId === it.id ? d.savedLoading : d.savedResume}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(d.savedRemoveConfirm)) onRemove(it.id);
                  }}
                  className="text-[12px] text-mist hover:text-ink60"
                >
                  {d.savedRemove}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
