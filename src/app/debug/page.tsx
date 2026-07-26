"use client";

import { useEffect, useRef, useState } from "react";

// בק־אופיס לתכנון: מריץ את כל הצינור (הדמיה → קונדישנינג → טרייס → החלקה →
// שערי נאמנות) ומציג כל שלב וכל קובץ, עם סימון נקודות כשל. כל הרצה נשמרת ליומן.

type Stage = { name: string; status: string; detail: string };
type Candidate = {
  candidate_id: string; iou: number; mean_dev_mm: number; max_dev_mm: number;
  source_holes: number; vector_holes: number; anchors: number; topology_ok: boolean;
  hole_budget?: number; source_components?: number; vector_components?: number;
  component_budget?: number; metal_svg?: string; cutouts_svg?: string;
  score: number; rejected_reason: string | null; selected: boolean;
};
type DebugMeta = {
  status?: string; width_mm?: number; height_mm?: number; smooth_iters?: number; color_key?: string | null;
  gates?: Record<string, number>;
  candidates?: Candidate[];
  stages?: Stage[];
  warnings?: string[];
};
// תגובת ההרצה החיה: debug כולל images ב-base64.
type RunDebug = DebugMeta & { images?: Record<string, string> };

type StageUrls = {
  render?: string | null; conditioned?: string | null; overlay?: string | null;
  difference?: string | null; rendered?: string | null;
};

type LogItem = {
  id: string; createdAt: string; source: string; productType: string | null;
  prompt: string | null; colorKey: string | null; status: string; error: string | null;
  durationMs: number | null; renderModel: string | null; renderUrl: string | null;
  stages: { conditioned: string | null; overlay: string | null; difference: string | null; rendered: string | null };
  /** הרשימה לא נושאת SVG — רק האם קיים. הפירוט נטען בפתיחה. */
  hasSvg: boolean;
  metrics: { iou?: number; holes?: number; meanDeviationMm?: number; maxDeviationMm?: number } | null;
  debug: DebugMeta | null;
};

/** הפירוט הכבד של הרצה אחת, נטען לפי דרישה מ-/api/debug/log/<id>. */
type LogDetail = { svg: string | null; debug: DebugMeta | null };

const detailOf = (d: LogDetail | "loading" | "error" | undefined): LogDetail | null =>
  d && d !== "loading" && d !== "error" ? d : null;

const STATUS_COLOR: Record<string, string> = {
  ok: "bg-green-100 text-green-800 border-green-300",
  pass: "bg-green-100 text-green-800 border-green-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  skip: "bg-porcelain text-ink60 border-graphite/20",
  warn: "bg-amber-100 text-amber-800 border-amber-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  error: "bg-red-100 text-red-800 border-red-300",
  fail: "bg-red-100 text-red-800 border-red-300",
};

const SOURCE_LABEL: Record<string, string> = {
  studio: "סטודיו", debug: "בק־אופיס", upload: "העלאה",
};

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export default function DebugPage() {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [heightMm, setHeightMm] = useState(15);
  const [colorKey, setColorKey] = useState("auto");
  const [productType, setProductType] = useState("bracelet");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [render, setRender] = useState<{ dataUrl: string; model: string | null } | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"run" | "log">("run");
  const [log, setLog] = useState<LogItem[] | null>(null);
  const [logBusy, setLogBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LogDetail | "loading" | "error">>({});

  const debug = (result?.debug ?? null) as RunDebug | null;
  const svg = (result?.metal_svg ?? result?.cutouts_svg ?? null) as string | null;

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const run = async (override?: { image?: string; prompt?: string }) => {
    const useImage = override?.image ?? image;
    const usePrompt = override?.prompt ?? prompt;
    setView("run");
    setBusy(true);
    setElapsed(0);
    setError(null);
    setRender(null);
    setResult(null);
    try {
      const resp = await fetch("/api/debug/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: usePrompt || undefined, image: useImage ? { dataUrl: useImage } : null, heightMm, colorKey, productType }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${resp.status}`);
      setRender(data.render);
      setResult(data.result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const [logError, setLogError] = useState<string | null>(null);

  const loadLog = async () => {
    setLogBusy(true);
    setLogError(null);
    try {
      const resp = await fetch("/api/debug/log");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setLog(data.items ?? []);
    } catch (e) {
      // בעבר כל כשל תורגם ל-log=[] והדף הציג "אין הרצות" — תקלה שנראית כמו
      // יומן ריק. עכשיו הכשל נאמר במפורש והרשימה הקודמת נשמרת.
      setLogError((e as Error).message);
    } finally {
      setLogBusy(false);
    }
  };

  /** פירוט הרצה (SVG סופי + SVG לכל מועמד) — נטען רק בפתיחה. */
  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (details[id] && details[id] !== "error") return;
    setDetails((d) => ({ ...d, [id]: "loading" }));
    try {
      const resp = await fetch(`/api/debug/log/${id}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as LogDetail;
      setDetails((d) => ({ ...d, [id]: { svg: data.svg ?? null, debug: data.debug ?? null } }));
    } catch {
      setDetails((d) => ({ ...d, [id]: "error" }));
    }
  };

  const openInDebug = async (renderUrl: string) => {
    try {
      const blob = await (await fetch(renderUrl)).blob();
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      setImage(dataUrl);
      setImageName("מהיומן");
      void run({ image: dataUrl, prompt: "" });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const img = (b64: string) => `data:image/png;base64,${b64}`;

  return (
    <div dir="rtl" className="mx-auto max-w-5xl p-4 text-sm">
      <h1 className="mb-3 text-lg font-bold">בק־אופיס — צינור תמונה→SVG</h1>

      <div className="mb-4 flex gap-2">
        <button className={`rounded-[2px] px-4 py-1.5 ${view === "run" ? "bg-graphite text-white" : "border border-graphite/20"}`}
          onClick={() => setView("run")}>הרצה</button>
        <button className={`rounded-[2px] px-4 py-1.5 ${view === "log" ? "bg-graphite text-white" : "border border-graphite/20"}`}
          onClick={() => { setView("log"); if (!log) void loadLog(); }}>יומן יצירות</button>
      </div>

      {view === "log" && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <button className="rounded-[2px] border border-graphite/20 px-3 py-1 text-xs hover:bg-porcelain" onClick={() => void loadLog()}>רענון</button>
            {logBusy && <span className="text-xs text-ink60">טוען…</span>}
            {log && <span className="text-xs text-mist">{log.length} הרצות</span>}
          </div>
          {logError && (
            <div className="rounded-[2px] border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              טעינת היומן נכשלה: {logError}
            </div>
          )}
          {(log ?? []).map((it) => (
            <div key={it.id} className="overflow-hidden rounded-[2px] border border-graphite/10 bg-white">
              {/* שורת סיכום */}
              <div className="flex items-start gap-3 p-2">
                {it.renderUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.renderUrl} alt="" className="h-14 w-24 shrink-0 rounded bg-porcelain object-contain" />
                ) : (
                  <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-porcelain text-[10px] text-mist">אין הדמיה</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded border px-1.5 text-xs ${STATUS_COLOR[it.status] ?? ""}`}>{it.status}</span>
                    <span className="rounded border border-graphite/20 bg-porcelain px-1.5 text-xs text-ink60">{SOURCE_LABEL[it.source] ?? it.source}</span>
                    {it.productType && <span className="text-xs text-ink60">{it.productType === "ring" ? "טבעת" : "צמיד"}</span>}
                    {it.metrics?.iou != null && <span className="text-xs text-ink60">IoU {it.metrics.iou.toFixed(3)}</span>}
                    {it.metrics?.holes != null && <span className="text-xs text-ink60">· {it.metrics.holes} חורים</span>}
                    {it.durationMs != null && <span className="text-xs text-mist">· {(it.durationMs / 1000).toFixed(1)}s</span>}
                  </div>
                  {it.prompt && <div className="mt-0.5 break-words text-xs text-ink60">{it.prompt}</div>}
                  {it.error && <div className="mt-0.5 break-words text-xs text-red-600">שגיאה: {it.error}</div>}
                  <div className="mt-0.5 text-[10px] text-mist">{new Date(it.createdAt).toLocaleString("he-IL")}{it.colorKey ? ` · צבע ${it.colorKey}` : ""}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button className="rounded-[2px] border border-graphite/20 px-2 py-1 text-xs hover:bg-porcelain"
                    onClick={() => void toggleExpand(it.id)}>{expanded === it.id ? "סגור" : "שלבים"}</button>
                  {it.renderUrl && (
                    <button className="rounded-[2px] border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                      onClick={() => void openInDebug(it.renderUrl!)}>הרץ מחדש</button>
                  )}
                </div>
              </div>
              {/* פירוט מלא */}
              {expanded === it.id && (
                <div className="border-t border-graphite/10 bg-porcelain p-3">
                  {details[it.id] === "loading" && <div className="text-xs text-ink60">טוען פירוט…</div>}
                  {details[it.id] === "error" && (
                    <div className="text-xs text-red-600">טעינת הפירוט נכשלה. אפשר לסגור ולפתוח שוב.</div>
                  )}
                  <Diagnostics
                    images={{
                      render: it.renderUrl,
                      conditioned: it.stages.conditioned,
                      overlay: it.stages.overlay,
                      difference: it.stages.difference,
                      rendered: it.stages.rendered,
                    }}
                    renderModel={it.renderModel}
                    svg={detailOf(details[it.id])?.svg ?? null}
                    // המדדים מגיעים עם הרשימה; ה-SVG של המועמדים רק מהפירוט.
                    debug={detailOf(details[it.id])?.debug ?? it.debug}
                  />
                </div>
              )}
            </div>
          ))}
          {log && log.length === 0 && !logBusy && <div className="text-mist">אין הרצות עדיין.</div>}
        </div>
      )}

      {view === "run" && <div className="mb-4 grid gap-2 rounded-[2px] border border-graphite/10 bg-white p-3">
        <textarea
          className="min-h-16 w-full rounded-[2px] border border-graphite/20 p-2"
          placeholder="פרומפט לעיצוב (למסלול טקסט→הדמיה)…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setImage(f ? await fileToDataUrl(f) : null);
              setImageName(f ? f.name : null);
            }} />
          <button type="button" className="rounded-[2px] border border-graphite/20 bg-porcelain px-3 py-1.5 hover:bg-porcelain"
            onClick={() => fileRef.current?.click()}>
            📎 העלאת תמונה
          </button>
          {imageName && (
            <span className="text-xs text-ink60">{imageName}
              <button className="ms-1 text-rose-600" onClick={() => { setImage(null); setImageName(null); if (fileRef.current) fileRef.current.value = ""; }}>✕</button>
            </span>
          )}
          <label className="flex items-center gap-1">מוצר:
            <select className="rounded border border-graphite/20 p-1" value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option value="bracelet">צמיד</option>
              <option value="ring">טבעת</option>
            </select>
          </label>
          <label className="flex items-center gap-1">רוחב (מ״מ):
            <input type="number" className="w-16 rounded border border-graphite/20 p-1" value={heightMm}
              onChange={(e) => setHeightMm(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-1">צבע:
            <select className="rounded border border-graphite/20 p-1" value={colorKey} onChange={(e) => setColorKey(e.target.value)}>
              <option value="auto">אוטומטי</option>
              <option value="warm">warm (פליז)</option>
              <option value="dark">dark</option>
              <option value="saturation">saturation</option>
            </select>
          </label>
          <button className="rounded-[2px] bg-graphite px-5 py-1.5 text-white disabled:opacity-60" disabled={busy} onClick={() => void run()}>
            {busy ? `מריץ… ${elapsed}s` : "הרץ"}
          </button>
        </div>
        {busy && (
          <div className="flex items-center gap-2 rounded-[2px] bg-amber-50 px-3 py-2 text-amber-800">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
            מייצר הדמיה וממיר ל-SVG… זה לוקח בערך 30–60 שניות, אל תסגור את הדף.
          </div>
        )}
      </div>}

      {view === "run" && error && <div className="mb-4 break-words rounded-[2px] border border-red-300 bg-red-50 p-3 text-red-800">שגיאה: {error}</div>}

      {view === "run" && debug && (
        <Diagnostics
          images={{
            render: render?.dataUrl ?? null,
            conditioned: debug.images?.conditioned ? img(debug.images.conditioned) : null,
            overlay: debug.images?.overlay ? img(debug.images.overlay) : null,
            difference: debug.images?.difference ? img(debug.images.difference) : null,
            rendered: debug.images?.rendered ? img(debug.images.rendered) : null,
          }}
          renderModel={render?.model ?? null}
          svg={svg}
          debug={debug}
        />
      )}

      {view === "run" && result && !debug && (
        <div className="rounded-[2px] border border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 font-semibold text-amber-800">אין פירוק שלבים — תגובת המנוע הגולמית:</div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// רכיב אבחון משותף לתצוגת הרצה חיה וליומן. images כבר כתובות URL/dataURL מוכנות.
function Diagnostics({ images, renderModel, svg, debug }: {
  images: StageUrls; renderModel: string | null; svg: string | null; debug: DebugMeta | null;
}) {
  const stages = debug?.stages ?? [];
  const candidates = debug?.candidates ?? [];
  const gates = debug?.gates ?? {};
  const warnings = debug?.warnings ?? [];
  // הגאומטריה של מועמד נבחר — מה שיצא בפועל מהמעקב, לבדיקה בעין.
  const [svgView, setSvgView] = useState<{ id: string; metal: string; cutouts: string } | null>(null);
  const [svgLayer, setSvgLayer] = useState<"metal" | "cutouts">("metal");
  return (
    <div className="grid gap-4">
      {/* timeline */}
      {(stages.length > 0 || debug?.status) && (
        <div className="rounded-[2px] border border-graphite/10 bg-white p-3">
          <div className="mb-2 font-semibold">
            שלבים — סטטוס כללי:{" "}
            <span className={`rounded border px-2 py-0.5 ${STATUS_COLOR[debug?.status ?? ""] ?? STATUS_COLOR.fail}`}>{debug?.status ?? "—"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stages.map((s, i) => (
              <div key={i} className={`rounded-[2px] border px-3 py-2 ${STATUS_COLOR[s.status] ?? ""}`}>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs opacity-80">{s.detail}</div>
              </div>
            ))}
          </div>
          {warnings.length > 0 && (
            <div className="mt-2 break-words text-xs text-amber-700">אזהרות: {warnings.join(" · ")}</div>
          )}
          {(gates.min_iou_hard != null || debug?.color_key != null) && (
            <div className="mt-2 text-xs text-ink60">
              צבע־מפתח: {debug?.color_key ?? "—"}
              {gates.min_iou_hard != null && <> · שערים: IoU≥{gates.min_iou_hard} · סטייה ממוצעת≤{gates.max_mean_deviation_mm}מ״מ · מקס≤{gates.max_max_deviation_mm}מ״מ</>}
              {debug?.smooth_iters != null && <> · החלקה x{debug.smooth_iters}</>}
              {debug?.width_mm != null && <> · אורך נגזר {debug.width_mm}מ״מ</>}
            </div>
          )}
        </div>
      )}

      {/* images */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {images.render && <ImgCard title={`הדמיית AI${renderModel ? ` (${renderModel})` : ""}`} src={images.render} />}
        {images.conditioned && <ImgCard title="דו־גוני (קונדישנינג)" src={images.conditioned} />}
        {images.overlay && <ImgCard title="Overlay (טרייס מול מקור)" src={images.overlay} />}
        {images.difference && <ImgCard title="Difference" src={images.difference} />}
        {images.rendered && <ImgCard title="רינדור חוזר של ה-SVG" src={images.rendered} />}
        {svg && <SvgCard title="SVG סופי" svg={svg} />}
      </div>

      {/* candidates */}
      {candidates.length > 0 && (
        <div className="overflow-x-auto rounded-[2px] border border-graphite/10 bg-white p-3">
          <div className="mb-2 font-semibold">מועמדים ({candidates.length})</div>
          <table className="w-full text-right text-xs">
            <thead className="text-ink60">
              <tr>
                <th className="p-1">מזהה</th><th className="p-1">IoU</th><th className="p-1">ממוצע</th><th className="p-1">מקס</th>
                <th className="p-1">חורים (מקור/וקטור)</th>
                <th className="p-1">חתיכות מתכת</th>
                <th className="p-1">טופולוגיה</th><th className="p-1">עוגנים</th>
                <th className="p-1">ציון</th><th className="p-1">נדחה</th><th className="p-1">שרטוט</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.candidate_id} className={`border-t border-graphite/10 ${c.selected ? "bg-green-50 font-medium" : ""}`}>
                  <td className="p-1">{c.candidate_id}{c.selected ? " ✓" : ""}</td>
                  <td className="p-1">{c.iou}</td>
                  <td className="p-1">{c.mean_dev_mm}</td>
                  <td className="p-1">{c.max_dev_mm}</td>
                  <td className="p-1">
                    {c.source_holes}/{c.vector_holes}
                    {c.hole_budget != null && <span className="text-ink60"> (≤{c.hole_budget})</span>}
                  </td>
                  <td className={`p-1 ${
                    c.vector_components != null && c.source_components != null &&
                    Math.abs(c.vector_components - c.source_components) > (c.component_budget ?? 1)
                      ? "font-semibold text-red-600" : ""}`}>
                    {c.source_components != null ? `${c.source_components}/${c.vector_components}` : "—"}
                  </td>
                  <td className="p-1">{c.topology_ok ? "✓" : "✗"}</td>
                  <td className="p-1">{c.anchors}</td>
                  <td className="p-1">{c.score}</td>
                  <td className="p-1 text-red-600">{c.rejected_reason ?? ""}</td>
                  <td className="p-1">
                    {c.metal_svg ? (
                      <button
                        type="button"
                        onClick={() => setSvgView({ id: c.candidate_id, metal: c.metal_svg!, cutouts: c.cutouts_svg ?? "" })}
                        className="rounded-[2px] border border-cobalt px-2 py-0.5 text-cobalt hover:bg-cobalt/5"
                      >
                        הצג
                      </button>
                    ) : (
                      <span className="text-ink60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* גאומטריה של המועמד שנבחר לצפייה */}
      {svgView && (
        <div className="rounded-[2px] border border-cobalt/40 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">שרטוט מהמעקב · {svgView.id}</div>
            <div className="flex items-center gap-2">
              {(["metal", "cutouts"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setSvgLayer(l)}
                  className={`rounded-[2px] border px-2 py-0.5 text-xs ${
                    svgLayer === l ? "border-graphite bg-graphite text-porcelain" : "border-graphite/30"}`}
                >
                  {l === "metal" ? "מתכת" : "חיתוכים"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSvgView(null)}
                className="rounded-[2px] border border-graphite/30 px-2 py-0.5 text-xs"
              >
                סגירה
              </button>
            </div>
          </div>
          <SvgCard
            title={svgLayer === "metal" ? "המתכת שנשארת" : "מה שנחתך"}
            svg={svgLayer === "metal" ? svgView.metal : svgView.cutouts}
          />
          <p className="mt-2 text-xs text-ink60">
            כך נראה התוצר בפועל. השוו למסכה הדו־גונית למעלה — עיוות במתאר החיצוני
            מוריד את ה-IoU ומקפיץ את הסטייה המקסימלית, גם כשהתבנית עצמה נראית תקינה.
          </p>
        </div>
      )}
    </div>
  );
}

function ImgCard({ title, src }: { title: string; src: string }) {
  return (
    <div className="rounded-[2px] border border-graphite/10 bg-white p-2">
      <div className="mb-1 text-xs font-medium text-ink60">{title}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="w-full rounded bg-porcelain object-contain" />
    </div>
  );
}

function SvgCard({ title, svg }: { title: string; svg: string }) {
  return (
    <div className="rounded-[2px] border border-graphite/10 bg-white p-2">
      <div className="mb-1 text-xs font-medium text-ink60">{title}</div>
      <div className="w-full rounded bg-graphite p-2 [&_svg]:w-full [&_svg]:fill-amber-400" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
