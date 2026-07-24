"use client";

// תצוגות העיצוב: הדמיית ערגול+זהב, שרטוט פריסה עם סימון אזורים, ותצוגת רוחב.
// מקור: handoff §3.5, §6.
import { useId } from "react";
import { he } from "@/i18n/he";
import { COBALT } from "./ui";
import type { Region } from "./model";

const d = he.design;

/* ===== 6.1 הדמיה — הפס מעורגל, גרדיאנט זהב, החיתוכים כחורים שקופים ===== */

export function RolledPreview({
  path, lengthMm, widthMm,
}: {
  path: string; lengthMm: number; widthMm: number;
}) {
  const uid = useId().replace(/:/g, "");
  const gold = `gold-${uid}`;
  const sheen = `sheen-${uid}`;

  return (
    <div className="flex w-full items-center justify-center overflow-hidden px-2 py-8">
      <div
        className="w-full max-w-[560px]"
        style={{ filter: "drop-shadow(0 14px 22px rgba(32,35,38,0.28))" }}
      >
        <svg
          viewBox={`0 0 ${lengthMm} ${widthMm}`}
          className="h-auto w-full"
          style={{ overflow: "visible" }}
          role="img"
          aria-label={d.modeRender}
        >
          <defs>
            {/* גרדיאנט לרוחב הפס — ההצללה הגלילית של הערגול */}
            <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9C7C2C" />
              <stop offset="18%" stopColor="#C9A34E" />
              <stop offset="42%" stopColor="#F0DA9A" />
              <stop offset="64%" stopColor="#E4C877" />
              <stop offset="100%" stopColor="#9C7C2C" />
            </linearGradient>
            {/* הבהוב אורכי עדין */}
            <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0.22" />
              <stop offset="26%" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="72%" stopColor="#fff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
            </linearGradient>
            <clipPath id={`clip-${uid}`}>
              <path d={path} fillRule="evenodd" />
            </clipPath>
          </defs>

          {path ? (
            <>
              <path d={path} fillRule="evenodd" fill={`url(#${gold})`} />
              <g clipPath={`url(#clip-${uid})`}>
                <rect x="0" y="0" width={lengthMm} height={widthMm} fill={`url(#${sheen})`} />
              </g>
            </>
          ) : (
            <rect x="0" y="0" width={lengthMm} height={widthMm} fill={`url(#${gold})`} />
          )}
        </svg>
      </div>
    </div>
  );
}

/* ===== 6.2 פריסה — שרטוט קווי + שלושה אזורים לחיצים ===== */

const ZONES: Array<{ id: Exclude<Region, "all">; from: number; to: number }> = [
  // RTL: "ימין" הוא הקצה הימני של השרטוט
  { id: "right", from: 2 / 3, to: 1 },
  { id: "center", from: 1 / 3, to: 2 / 3 },
  { id: "left", from: 0, to: 1 / 3 },
];

export function FlatDrawing({
  path, lengthMm, widthMm, region, onRegion,
}: {
  path: string; lengthMm: number; widthMm: number;
  region: Region | null; onRegion: (r: Region) => void;
}) {
  return (
    <div className="w-full overflow-hidden px-2 py-8">
      <svg
        viewBox={`-2 -2 ${lengthMm + 4} ${widthMm + 4}`}
        className="h-auto w-full"
        role="img"
        aria-label={d.modeFlat}
      >
        {/* מסגרת הרצועה */}
        <rect
          x="0" y="0" width={lengthMm} height={widthMm}
          fill="none" stroke="rgba(32,35,38,0.35)" strokeWidth={Math.max(0.25, widthMm / 90)}
        />
        {/* החיתוכים בקו כחול */}
        {path && (
          <path
            d={path}
            fillRule="evenodd"
            fill="none"
            stroke={COBALT}
            strokeWidth={Math.max(0.2, widthMm / 110)}
            strokeLinejoin="round"
          />
        )}
        {/* אזורים לחיצים */}
        {ZONES.map((z) => {
          const on = region === z.id;
          return (
            <g key={z.id} onClick={() => onRegion(z.id)} style={{ cursor: "pointer" }}>
              <rect
                x={lengthMm * z.from}
                y={0}
                width={lengthMm * (z.to - z.from)}
                height={widthMm}
                fill={on ? "rgba(49,91,255,0.10)" : "transparent"}
                stroke={on ? COBALT : "transparent"}
                strokeWidth={Math.max(0.3, widthMm / 70)}
                strokeDasharray={`${Math.max(1, widthMm / 8)} ${Math.max(0.8, widthMm / 12)}`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function RegionChips({
  region, onRegion,
}: {
  region: Region | null; onRegion: (r: Region) => void;
}) {
  const all: Region[] = ["right", "center", "left", "all"];
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((r) => {
        const on = region === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onRegion(r)}
            aria-pressed={on}
            className="rounded-[2px] px-3.5 py-2 text-[13px] transition-colors"
            style={{
              border: `1px solid ${on ? COBALT : "rgba(32,35,38,0.2)"}`,
              background: on ? COBALT : "#fff",
              color: on ? "#fff" : "#202326",
            }}
          >
            {d.regions[r]}
          </button>
        );
      })}
    </div>
  );
}

/* ===== 3.5 תצוגת רוחב — סכמטית, קנה מידה קבוע ===== */

export function WidthPreview({
  product, widthMm,
}: {
  product: "bracelet" | "ring"; widthMm: number;
}) {
  const uid = useId().replace(/:/g, "");
  const ring = product === "ring";

  // צמיד: פרק כף יד ממוצע, היקף 165 מ"מ → קוטר ≈ 52.5 מ"מ; 2.6px/מ"מ.
  // טבעת: אצבע ממוצעת בקוטר 17 מ"מ; 9px/מ"מ.
  const scale = ring ? 9 : 2.6;
  const limbMm = ring ? 17 : 165 / Math.PI;
  const limbPx = limbMm * scale;
  const bandPx = widthMm * scale;

  const H = 250;
  const W = 300;
  const cx = W / 2;

  return (
    <div>
      <div className="flex items-center justify-center overflow-hidden border border-graphite/10 bg-porcelain">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={d.widthPreviewTitle}>
          <defs>
            <linearGradient id={`skin-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#d8d2c8" />
              <stop offset="45%" stopColor="#e7e1d6" />
              <stop offset="100%" stopColor="#cfc8bc" />
            </linearGradient>
            <linearGradient id={`band-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#9C7C2C" />
              <stop offset="30%" stopColor="#E4C877" />
              <stop offset="55%" stopColor="#F0DA9A" />
              <stop offset="100%" stopColor="#C9A34E" />
            </linearGradient>
          </defs>

          {/* האיבר (פרק כף יד / אצבע) — אנכי */}
          <rect
            x={cx - limbPx / 2}
            y={0}
            width={limbPx}
            height={H}
            rx={ring ? limbPx / 2.6 : limbPx / 5}
            fill={`url(#skin-${uid})`}
          />

          {/* הפס הנבחר — ממורכז אנכית */}
          <rect
            x={cx - limbPx / 2 - 3}
            y={H / 2 - bandPx / 2}
            width={limbPx + 6}
            height={Math.max(2, bandPx)}
            rx={1}
            fill={`url(#band-${uid})`}
          />

          {/* קו מידה */}
          <g stroke="rgba(32,35,38,0.5)" strokeWidth="1">
            <line x1={cx + limbPx / 2 + 18} y1={H / 2 - bandPx / 2} x2={cx + limbPx / 2 + 18} y2={H / 2 + bandPx / 2} />
            <line x1={cx + limbPx / 2 + 14} y1={H / 2 - bandPx / 2} x2={cx + limbPx / 2 + 22} y2={H / 2 - bandPx / 2} />
            <line x1={cx + limbPx / 2 + 14} y1={H / 2 + bandPx / 2} x2={cx + limbPx / 2 + 22} y2={H / 2 + bandPx / 2} />
          </g>
          <text
            x={cx + limbPx / 2 + 28}
            y={H / 2 + 4}
            fontSize="12"
            fontFamily="ui-monospace, monospace"
            fill="#6b6f73"
          >
            {widthMm} {d.mm}
          </text>
        </svg>
      </div>
      <p className="mt-3 text-[13px] text-ink60">
        {ring ? d.widthPreviewRing : d.widthPreviewBracelet}
      </p>
      <p className="mt-1 text-[12px] text-mist">{d.widthPreviewNote}</p>
    </div>
  );
}
