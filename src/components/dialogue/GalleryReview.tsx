"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dialogue } from "@/i18n/dialogue";
import galleryTags from "@/data/gallery-tags.json";

// dialogue mode — דף הביקורת על תיוג הגלריה (‏PROMPT_SPEC §3.2): תמונה ליד
// תגים, עם סינון לפי תג. **זה אב-הטיפוס של הגלריה** — אותו קובץ, אותו
// סינון — והוא מה שמאפשר לגל לאצור: לעבור על 226 הרשומות, ולסמן בקובץ
// (‏overrides.gallery: true, דרך PR) מה נכנס לרשימה המאוצרת שהגלריה של
// טיפוס 2 תציג.
//
// **הקובץ נקרא ב-import סטטי** — כפי ש-§3.2 קובע: קובץ בגיט הוא מקור האמת,
// גרסאות ו-diff על כל ריצת תיוג, בלי מיגרציה. מה שהקובץ אינו נושא — הציור —
// מושלם מ-`/api/admin/gallery` לפי הרשומות שמוצגות בפועל, בקבוצות.

const g = dialogue.gallery;

interface TagRecord {
  version_id: string;
  design_id?: string;
  serial?: number;
  product_type?: string;
  length_mm?: number;
  width_mm?: number;
  validation_status?: string;
  lettering?: boolean;
  missing?: boolean;
  computed?: Record<string, unknown>;
  read?: Record<string, unknown> & { character_tags?: string[]; concept?: string };
  overrides?: Record<string, unknown>;
  tagged_at?: string;
}

const RECORDS: TagRecord[] = ((galleryTags as { designs?: unknown }).designs ?? []) as TagRecord[];

/** כמה מוצגים בכל פעם — הציורים נמשכים רק למה שמוצג. */
const PAGE = 24;

/** תג של רשומה, אחרי קדימות: `overrides` גובר על `read` (‏§3.2). */
function tagsOf(r: TagRecord): string[] {
  const over = r.overrides?.character_tags;
  const read = r.read?.character_tags;
  const tags = Array.isArray(over) ? over : Array.isArray(read) ? read : [];
  return tags.filter((t): t is string => typeof t === "string");
}

/** האם הרשומה ברשימה המאוצרת — מה שהגלריה של הראיון תציג. הסימון חי
 *  ב-`overrides` בכוונה: ריצת תיוג חוזרת לא נוגעת בו. */
const isCurated = (r: TagRecord): boolean => r.overrides?.gallery === true;

/** ערך שדה להצגה: מספרים מעוגלים, אובייקטים מקופלים ל-JSON קצר. */
function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "✓" : "✗";
  return JSON.stringify(value);
}

export default function GalleryReview() {
  const [tag, setTag] = useState<string | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [curatedOnly, setCuratedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const fetching = useRef(new Set<string>());

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of RECORDS) for (const t of tagsOf(r)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  const filtered = useMemo(
    () =>
      RECORDS.filter(
        (r) =>
          (!curatedOnly || isCurated(r)) &&
          (!tag || tagsOf(r).includes(tag)) &&
          (!product || r.product_type === product),
      ),
    [tag, product, curatedOnly],
  );
  const visible = filtered.slice(0, shown);

  // הציורים — רק למה שמוצג, בקבוצות, ופעם אחת לכל גרסה.
  useEffect(() => {
    const missing = visible
      .map((r) => r.version_id)
      .filter((id) => id && !(id in svgs) && !fetching.current.has(id));
    if (!missing.length) return;
    for (const id of missing) fetching.current.add(id);
    const batch = missing.slice(0, 60);
    fetch(`/api/admin/gallery?ids=${batch.join(",")}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { svgs: Record<string, string> }) => {
        // גם מי שלא חזר נרשם — כמחרוזת ריקה: הגרסה נמחקה, ואין טעם לשאול שוב.
        setSvgs((prev) => {
          const next = { ...prev };
          for (const id of batch) next[id] = data.svgs[id] ?? "";
          return next;
        });
      })
      .catch(() => {
        for (const id of batch) fetching.current.delete(id);
      });
  }, [visible, svgs]);

  return (
    <div className="grid gap-4">
      <div className="rounded-[2px] border border-graphite/10 bg-white p-3">
        <p className="text-[13px] leading-relaxed text-ink60">{g.lede}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink60">{g.curationHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className={`rounded-[2px] px-3 py-1 text-[13px] ${tag === null ? "bg-graphite text-white" : "border border-graphite/20"}`}
            onClick={() => { setTag(null); setShown(PAGE); }}
          >
            {g.filterAll}
          </button>
          {allTags.map(([t, n]) => (
            <button
              key={t}
              className={`rounded-[2px] px-3 py-1 text-[13px] ${tag === t ? "bg-graphite text-white" : "border border-graphite/20"}`}
              onClick={() => { setTag(tag === t ? null : t); setShown(PAGE); }}
            >
              {t} · {n}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-graphite/20" aria-hidden="true" />
          {/* הרשימה המאוצרת — בדיוק מה שהגלריה של הראיון תציג. */}
          <button
            className={`rounded-[2px] px-3 py-1 text-[13px] ${curatedOnly ? "bg-lapis text-white" : "border border-lapis/40 text-lapis-ink"}`}
            onClick={() => { setCuratedOnly((v) => !v); setShown(PAGE); }}
          >
            ★ {g.filterCurated} · {RECORDS.filter(isCurated).length}
          </button>
          {(["bracelet", "ring"] as const).map((p) => (
            <button
              key={p}
              className={`rounded-[2px] px-3 py-1 text-[13px] ${product === p ? "bg-graphite text-white" : "border border-graphite/20"}`}
              onClick={() => { setProduct(product === p ? null : p); setShown(PAGE); }}
            >
              {g.product[p]}
            </button>
          ))}
          <span className="ms-auto text-[12px] text-mist">{g.count(filtered.length, RECORDS.length)}</span>
        </div>
      </div>

      {filtered.length === 0 && <p className="text-[14px] text-ink60">{g.empty}</p>}

      <div className="grid gap-3">
        {visible.map((r) => (
          <div key={r.version_id} className="grid gap-3 rounded-[2px] border border-graphite/10 bg-white p-3 md:grid-cols-[280px_1fr]">
            <div>
              {svgs[r.version_id] ? (
                <div
                  className="w-full rounded bg-[#101114] p-2 [&_svg]:w-full [&_svg]:fill-[#ffd43b] [&_svg_*]:fill-[#ffd43b]"
                  dangerouslySetInnerHTML={{ __html: svgs[r.version_id] }}
                />
              ) : (
                <div className="flex h-20 items-center justify-center rounded bg-porcelain text-[12px] text-mist">
                  {svgs[r.version_id] === "" ? g.svgMissing : g.loading}
                </div>
              )}
              <div className="mt-1 text-[12px] text-ink60">
                {isCurated(r) && <span className="me-1 text-lapis-ink">★</span>}
                {r.serial ? `#${r.serial} · ` : ""}
                {g.product[r.product_type ?? ""] ?? r.product_type} · {show(r.length_mm)}×{show(r.width_mm)} מ״מ
                {r.missing ? " · חסר ב-DB" : ""}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {tagsOf(r).map((t) => (
                  <span key={t} className="rounded-[2px] bg-lapis/10 px-2 py-0.5 text-[12px] text-lapis-ink">
                    {t}
                  </span>
                ))}
              </div>
              {r.read?.concept && (
                <div className="mt-1 text-[12px] text-ink60">
                  {g.conceptLabel}: {r.read.concept}
                </div>
              )}
            </div>

            <div className="grid gap-2 text-[12px] leading-relaxed sm:grid-cols-2">
              <div>
                <div className="font-semibold text-graphite">{g.computedTitle}</div>
                {Object.entries(g.computedFields).map(([key, label]) =>
                  r.computed && key in r.computed ? (
                    <div key={key} className="flex justify-between gap-2 border-b border-graphite/5 py-0.5">
                      <span className="text-ink60">{label}</span>
                      <bdi>{show(r.computed[key])}</bdi>
                    </div>
                  ) : null,
                )}
              </div>
              <div>
                <div className="font-semibold text-graphite">{g.readTitle}</div>
                {Object.entries(g.readFields).map(([key, label]) =>
                  r.read && key in r.read ? (
                    <div key={key} className="flex justify-between gap-2 border-b border-graphite/5 py-0.5">
                      <span className="text-ink60">{label}</span>
                      <span className="text-end">{show(r.read[key])}</span>
                    </div>
                  ) : null,
                )}
                {r.overrides && Object.keys(r.overrides).length > 0 && (
                  <div className="mt-2">
                    <div className="font-semibold text-graphite">{g.overridesTitle}</div>
                    <pre className="overflow-x-auto text-[11px] text-ink60">
                      {JSON.stringify(r.overrides, null, 1)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {shown < filtered.length && (
        <button
          className="justify-self-center rounded-[2px] border border-graphite/20 px-5 py-1.5 text-[13px] hover:bg-porcelain"
          onClick={() => setShown((n) => n + PAGE)}
        >
          + {Math.min(PAGE, filtered.length - shown)}
        </button>
      )}
    </div>
  );
}
