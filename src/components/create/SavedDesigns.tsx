"use client";

// "העיצובים שלי" — תוספת מעבר ל-handoff. מוצג מעל בחירת המוצר כשיש מה להמשיך.
// מקופל כברירת מחדל: הרשימה הפתוחה תפסה שליש מסך ודחפה את בחירת הצמיד/הטבעת
// מתחת לקיפול, כך שמסך הכניסה של המשפך היה "העיצובים שלי" ולא "מה בונים".
// עכשיו זו שורה אחת בולטת שנפתחת בלחיצה.
import { useEffect, useId, useState } from "react";
import { he } from "@/i18n/he";
import { designCode } from "@/lib/designCode";
import { COBALT } from "./ui";
import type { SavedDesign } from "@/lib/client/myDesigns";

const d = he.design;

export function SavedDesigns({
  items, onResume, onRemove, onOpen, loadingId, error, defaultOpen = false,
}: {
  items: SavedDesign[];
  onResume: (item: SavedDesign) => void;
  onRemove: (id: string) => void;
  /** הרשימה נפתחה — עכשיו יש למי לצייר, וכדאי להשלים ציורים חסרים מהשרת. */
  onOpen?: () => void;
  loadingId: string | null;
  error: string | null;
  /** נכנסו דרך "העיצובים שלי" בכותרת — הרשימה נפתחת מעצמה. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();

  useEffect(() => {
    if (open) onOpen?.();
  }, [open, onOpen]);

  if (items.length === 0) return null;

  return (
    <div className="border border-graphite/10 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center gap-3 border-s-2 border-s-cobalt px-5 py-3.5 text-start transition-colors hover:bg-porcelain"
      >
        <span className="font-display text-xs tracking-[0.15em] text-graphite">
          {d.savedTitle}
        </span>
        <span className="text-[13px] text-ink60">
          {items.length === 1 ? d.savedCountOne : `${items.length} ${d.savedCountMany}`}
        </span>
        <span className="ms-auto flex items-center gap-1.5 text-[13px] font-semibold text-cobalt">
          {open ? d.savedHide : d.savedShow}
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {/* מחוץ לאזור המתקפל: שגיאת טעינה חייבת להישאר גלויה */}
      {error && <p className="border-t border-graphite/10 px-5 py-3 text-[13px] text-[#c0413b]">{error}</p>}

      {open && (
        <div id={listId} className="border-t border-graphite/10 p-5">
          <p className="mb-4 text-sm text-ink60">{d.savedSubtitle}</p>

          <ul className="grid max-h-[46vh] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <li key={it.id} className="flex flex-col border border-graphite/[0.14] bg-porcelain">
                {/* תצוגה מקדימה מהגאומטריה השמורה */}
                <div className="flex h-[60px] items-center justify-center overflow-hidden border-b border-graphite/10 bg-white px-3">
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
                    <span className="font-mono text-[11px] text-mist">
                      {it.pending ? d.savedPending : d.savedNoPreview}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-3.5">
                  {/* המספר הסידורי קודם לשם: הוא מה שאומרים כשמדברים על העיצוב */}
                  {designCode(it.serial) && (
                    <div className="mb-1 font-display text-[11px] tracking-[0.14em] text-cobalt" dir="ltr">
                      {designCode(it.serial)}
                    </div>
                  )}
                  <div className="text-sm font-semibold text-graphite">
                    {it.product === "ring" ? he.ring : he.bracelet} · {it.circMm} {d.mm}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink60">
                    {it.widthMm} {d.mm}
                    {it.pending ? ` · ${d.savedPending}` : ` · ${it.cuts} ${d.savedCuts}`}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onResume(it)}
                      disabled={loadingId === it.id}
                      className="text-[13px] font-semibold text-cobalt underline-offset-4 hover:underline disabled:opacity-60"
                    >
                      {loadingId === it.id ? d.savedLoading : it.pending ? d.savedFinish : d.savedResume}
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
      )}
    </div>
  );
}
