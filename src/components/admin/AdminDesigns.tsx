"use client";

// "מי עיצב מה" — הלשונית שהופכת רישום משתמשים למשהו שאפשר להסתכל עליו.
import { useCallback, useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { designCode } from "@/lib/designCode";
import type { AdminDesignRow } from "@/lib/db/accounts";

const s = he.site;

const PAGE = 24;

/**
 * ה-SVG נטען כתמונה ולא מוזרק ל-DOM. הוא נבנה מפרומפט של משתמש, ותמונה
 * מ-data: URI לא מריצה סקריפט — בעוד הזרקה ישירה כן הייתה יכולה.
 */
function preview(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function AdminDesigns({
  onAuthLost,
}: {
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  const [rows, setRows] = useState<AdminDesignRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      const res = await fetch(`/api/admin/designs?limit=${PAGE}&offset=${offset}`);
      setLoading(false);
      if (res.status === 401) return onAuthLost("out");
      if (res.status === 503) {
        // 503 כאן הוא או "אין ADMIN_TOKEN" או "המיגרציה לא רצה" — שני מצבים
        // שונים לגמרי, ולכן מפרידים לפי הקוד ולא לפי הסטטוס.
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        if (body?.error?.code === "schema_outdated") {
          setError(s.adminDesignsSchema);
          return;
        }
        return onAuthLost("disabled");
      }
      if (!res.ok) {
        setError(s.adminDesignsError);
        return;
      }
      const body = (await res.json()) as { designs: AdminDesignRow[]; total: number };
      setRows((prev) => (offset === 0 ? body.designs : [...prev, ...body.designs]));
      setTotal(body.total);
      setError(null);
    },
    [onAuthLost],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  if (error) return <p className="text-sm text-[#c0413b]">{error}</p>;
  if (loading && rows.length === 0) return <p className="text-ink60">{he.loading}</p>;
  if (rows.length === 0) return <p className="text-ink60">{s.adminDesignsEmpty}</p>;

  return (
    <div>
      <p className="mb-4 text-[13px] text-mist">
        {s.adminShowing} {rows.length} {s.adminOf} {total}
      </p>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col border border-graphite/10 bg-white">
            <div className="flex h-[110px] items-center justify-center overflow-hidden border-b border-graphite/10 bg-porcelain p-3">
              {r.svg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview(r.svg)} alt={r.name} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[12px] text-mist">{s.adminNoPreview}</span>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[13px] font-bold tracking-[0.14em] text-cobalt" dir="ltr">
                  {designCode(r.serial) ?? "—"}
                </span>
                <span className="text-[12px] text-mist">
                  {new Date(r.created_at).toLocaleDateString("he-IL")}
                </span>
              </div>

              <div className="text-sm text-graphite">
                {r.product_type === "ring" ? he.ring : he.bracelet} ·{" "}
                {Math.round(r.length_mm + r.gap_mm)} × {r.width_mm} {he.design.mm}
              </div>

              {r.owner ? (
                <div className="mt-auto border-t border-graphite/10 pt-2">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: r.owner.color }}
                    />
                    <span className="text-sm font-semibold text-graphite">{r.owner.name}</span>
                    {r.owner.kind === "tester" && (
                      <span className="bg-stonesoft px-1.5 py-0.5 text-[11px] text-ink60">
                        {s.adminTesterBadge}
                      </span>
                    )}
                  </div>
                  {r.owner.email && (
                    <a
                      href={`mailto:${r.owner.email}`}
                      className="block text-[13px] text-ink60 hover:underline"
                    >
                      <bdi>{r.owner.email}</bdi>
                    </a>
                  )}
                  {r.owner.phone && (
                    <div className="text-[13px] text-ink60">
                      <bdi>{r.owner.phone}</bdi>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-auto border-t border-graphite/10 pt-2 text-[13px] text-mist">
                  {s.adminNoOwner}
                </div>
              )}

              <div className="text-[12px] text-mist">
                {r.versions} {s.adminVersions}
              </div>

              <ExportFiles designId={r.id} hasVersion={r.svg !== null} />
            </div>
          </li>
        ))}
      </ul>

      {rows.length < total && (
        <button
          type="button"
          onClick={() => void load(rows.length)}
          disabled={loading}
          className="mt-6 rounded-[2px] border border-graphite/25 px-6 py-3 text-sm text-graphite transition-colors hover:bg-porcelain disabled:opacity-50"
        >
          {loading ? he.loading : s.adminMore}
        </button>
      )}
    </div>
  );
}

/**
 * הורדת קבצי הייצור של עיצוב.
 *
 * זה מה שנחתך בפועל — המתאר של המתכת ב-DXF וב-SVG, במילימטרים — ולא ה-SVG
 * שמוצג בכרטיס, שהוא תצוגה מקדימה של החיתוכים. הקישורים נחתמים לשעה ולכן הם
 * מיוצרים בלחיצה ולא מראש.
 */
function ExportFiles({ designId, hasVersion }: { designId: string; hasVersion: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "error" | "blocked" | "none">("idle");
  const [files, setFiles] = useState<{ svgUrl: string; dxfUrl: string; warn: boolean } | null>(null);

  async function run() {
    setState("busy");
    const res = await fetch(`/api/admin/designs/${designId}/export`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      // "נכשל בוולידציה" ו"אין גרסה" הם מצבים שאפשר לעשות איתם משהו, בניגוד
      // לתקלה — ולכן הם נאמרים בנפרד ולא כ"ההכנה נכשלה".
      setState(
        body?.error?.code === "export_blocked"
          ? "blocked"
          : body?.error?.code === "no_version"
            ? "none"
            : "error",
      );
      return;
    }
    const body = (await res.json()) as { svgUrl: string; dxfUrl: string; validationStatus: string };
    setFiles({ svgUrl: body.svgUrl, dxfUrl: body.dxfUrl, warn: body.validationStatus === "warn" });
    setState("idle");
  }

  if (!hasVersion) return null;

  if (files) {
    return (
      <div className="mt-1 border-t border-graphite/10 pt-2">
        <div className="flex flex-wrap gap-3 text-[13px]">
          <a href={files.svgUrl} className="font-semibold text-cobalt hover:underline">
            {s.adminExportSvg}
          </a>
          <a href={files.dxfUrl} className="font-semibold text-cobalt hover:underline">
            {s.adminExportDxf}
          </a>
        </div>
        {files.warn && <p className="mt-1 text-[12px] text-[#8a6d12]">{s.adminExportWarn}</p>}
      </div>
    );
  }

  return (
    <div className="mt-1 border-t border-graphite/10 pt-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "busy"}
        className="text-[13px] text-cobalt hover:underline disabled:text-mist disabled:no-underline"
      >
        {state === "busy" ? s.adminExporting : s.adminExport}
      </button>
      {state === "blocked" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportBlocked}</p>}
      {state === "none" && <p className="mt-1 text-[12px] text-mist">{s.adminExportNone}</p>}
      {state === "error" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportError}</p>}
    </div>
  );
}
