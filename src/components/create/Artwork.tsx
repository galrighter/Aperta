"use client";

// תצוגות העיצוב: הדמיית ערגול בגוון פליז, שרטוט פריסה עם סימון אזורים, ותצוגת רוחב.
// מקור: handoff §3.5, §6.
import { useId } from "react";
import Image from "next/image";
import { he } from "@/i18n/he";
import { LAPIS } from "./ui";
import type { Region } from "./model";

const d = he.design;

// כיול תצוגת הרוחב על גבי הצילומים (handoff v3 §3). היחס נעול לגודל האמיתי של
// הקובץ כדי ש-object-fit:cover לא יחתוך ויסיט את הקואורדינטות המכוילות.
const PREVIEW = {
  bracelet: {
    src: "/hand-wrist.webp",
    alt: he.design.widthPreviewBraceletAlt,
    aspect: "1000 / 1268",
    left: "43%",
    top: "63%",
    width: "34%",
    rotate: "-48deg",
    radius: 10,
    tag: "WRIST · AVG 165mm",
  },
  ring: {
    src: "/hand-ring.webp",
    alt: he.design.widthPreviewRingAlt,
    aspect: "1000 / 1250",
    left: "29%",
    top: "53%",
    width: "15%",
    rotate: "-20deg",
    radius: 6,
    tag: "FINGER · AVG 17mm Ø",
  },
} as const;

/* ===== 6.1 הדמיה — הפס מעורגל, גרדיאנט פליז, החיתוכים כחורים שקופים ===== */

export function RolledPreview({
  cutouts, lengthMm, widthMm,
}: {
  cutouts: string; lengthMm: number; widthMm: number;
}) {
  const uid = useId().replace(/:/g, "");
  const gold = `gold-${uid}`;
  const sheen = `sheen-${uid}`;
  const mask = `mask-${uid}`;

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
            <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0.22" />
              <stop offset="26%" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="72%" stopColor="#fff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
            </linearGradient>
            {/* החיתוכים כחורים אמיתיים: לבן = מתכת, שחור = מוסר.
                נגזר מה-SVG של הגרסה, שתמיד קיים — לא מ-geometry שעשוי לחזור ריק. */}
            <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={lengthMm} height={widthMm}>
              <rect x="0" y="0" width={lengthMm} height={widthMm} fill="#fff" />
              <g fill="#000" stroke="none" dangerouslySetInnerHTML={{ __html: cutouts }} />
            </mask>
          </defs>

          <g mask={`url(#${mask})`}>
            <rect x="0" y="0" width={lengthMm} height={widthMm} fill={`url(#${gold})`} />
            <rect x="0" y="0" width={lengthMm} height={widthMm} fill={`url(#${sheen})`} />
          </g>
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

/** מקום שהוולידציה סימנה, במ"מ על הפס — כדי שפסילה תראה איפה ולא רק שהיא קרתה. */
export interface IssueMark {
  x: number;
  y: number;
  r?: number;
  status: "warn" | "fail";
}

export function FlatDrawing({
  cutouts, lengthMm, widthMm, region, onRegion, issues = [],
}: {
  cutouts: string; lengthMm: number; widthMm: number;
  region: Region | null; onRegion: (r: Region) => void;
  issues?: IssueMark[];
}) {
  return (
    <div className="w-full overflow-hidden px-2 py-8">
      <svg
        viewBox={`-2 -2 ${lengthMm + 4} ${widthMm + 4}`}
        className="h-auto w-full"
        role="img"
        aria-label={d.modeFlat}
      >
        {/* הרצועה מלאה, והחיתוכים בצבע הרקע — אותה קוטביות כמו בסטודיו: כהה
            הוא מתכת ובהיר הוא אוויר.

            מה שהיה כאן קודם ניסה לצייר קווי מתאר כחולים (`fill="none"` על ה-g),
            אבל זה מעולם לא רץ: כל path בחוזה נושא `fill="black"` משלו, ותכונת
            הצגה על הצאצא גוברת על ערך שיורש מההורה. בפועל הוצגו צורות שחורות
            מלאות על רקע בהיר — כלומר נגטיב, עם קו כחול דק סביבן. */}
        <rect x="0" y="0" width={lengthMm} height={widthMm} fill="var(--color-graphite)" />
        {cutouts && (
          <g className="flat-cutouts" dangerouslySetInnerHTML={{ __html: cutouts }} />
        )}
        {/* מה שהוולידציה פסלה, במקום שבו הוא יושב. אותו סימון כמו בסטודיו: עיגול
            מקווקו סביב הממצא. בלי זה "פתח קטן מדי לחיתוך" הוא פסק דין בלי ראיה —
            הלקוחה רואה תבנית עם עשרות פתחים גדולים ולא יכולה לדעת על מה מדובר. */}
        {issues.map((h, i) => (
          <circle
            key={i}
            cx={h.x}
            cy={h.y}
            r={Math.max(h.r ?? 0, widthMm / 12)}
            fill="none"
            stroke={h.status === "fail" ? "#f0736c" : "#f0a75a"}
            strokeWidth={Math.max(0.25, widthMm / 80)}
            strokeDasharray={`${Math.max(0.6, widthMm / 30)} ${Math.max(0.4, widthMm / 45)}`}
          />
        ))}
        {/* אזורי הבחירה על השרטוט — קיצור דרך לעכבר, ולא הפקד עצמו.
            הם היו `onClick` עם `cursor:pointer` ובלי שום מקבילה במקלדת. הבחירה
            האמיתית חיה ב-`RegionChips` למטה — כפתורים עם `aria-pressed`,
            באותו מסך, ולכן אין כאן פונקציונליות שאבודה למי שאינו בעכבר.
            מה שכן היה אבוד הוא הבהירות: קורא מסך הכריז על שלוש קבוצות SVG
            לחיצות שאין דרך להפעיל, ליד שלושה כפתורים שכן. `aria-hidden`
            מוציא את הכפילות מעץ הנגישות ומשאיר את קיצור הדרך לעכבר. */}
        {ZONES.map((z) => {
          const on = region === z.id;
          return (
            <g
              key={z.id}
              onClick={() => onRegion(z.id)}
              aria-hidden="true"
              style={{ cursor: "pointer" }}
            >
              <rect
                x={lengthMm * z.from}
                y={0}
                width={lengthMm * (z.to - z.from)}
                height={widthMm}
                fill={on ? "rgba(63,98,151,0.20)" : "transparent"}
                stroke={on ? LAPIS : "transparent"}
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
  const all: Region[] = ["all", "right", "center", "left"];
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
              border: `1px solid ${on ? LAPIS : "rgba(32,35,38,0.2)"}`,
              background: on ? LAPIS : "#fff",
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
  const ring = product === "ring";
  const cfg = ring ? PREVIEW.ring : PREVIEW.bracelet;

  // גובה הפס כאחוז מגובה התיבה. הצילומים מכוילים אנטומית (פרק כף יד ≈ 55 מ״מ
  // לרוחב, אצבע ≈ 17 מ״מ קוטר), ולכן 0.44% לכל מ״מ נותן פרופורציה נכונה בכל רוחב
  // תצוגה. התיבה נעולה ליחס הצילום כדי שהקואורדינטות יישארו מכוילות.
  const bandH = `${(widthMm * 0.44).toFixed(2)}%`;

  return (
    <div>
      <div
        className="relative overflow-hidden border border-graphite/10"
        style={{ aspectRatio: cfg.aspect }}
      >
        <Image
          src={cfg.src}
          alt={cfg.alt}
          fill
          sizes="(max-width: 768px) 100vw, 340px"
          className="object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute"
          style={{
            left: cfg.left,
            top: cfg.top,
            width: cfg.width,
            height: bandH,
            transform: `translate(-50%, -50%) rotate(${cfg.rotate})`,
            background:
              "linear-gradient(180deg, rgba(240,218,154,0.95), rgba(201,163,78,0.96) 45%, rgba(156,124,44,0.95))",
            borderRadius: cfg.radius,
            boxShadow:
              "0 5px 16px rgba(32,35,38,0.35), inset 0 1px 2px rgba(255,255,255,0.5)",
            transition: "height 0.25s ease",
          }}
        />
        <div className="absolute bottom-3 right-3.5 whitespace-nowrap bg-porcelain/80 px-2 py-[3px] font-display text-[11px] tracking-[0.08em] text-ink60">
          {cfg.tag}
        </div>
      </div>
      <p className="mt-3 text-[13px] font-semibold text-ink80">
        {ring ? d.widthPreviewRing : d.widthPreviewBracelet}
      </p>
      <p className="mt-0.5 text-[12px] text-ink60">
        {ring ? d.widthPreviewRingBase : d.widthPreviewBraceletBase}
      </p>
      <p className="mt-1 text-[12px] text-mist">{d.widthPreviewNote}</p>
    </div>
  );
}
