"use client";

// מעבדת היצירה: מריצה את כל הצינור (הדמיה → קונדישנינג → טרייס → החלקה →
// שערי נאמנות) ומציגה כל שלב וכל קובץ, עם סימון נקודות כשל. כל הרצה נשמרת ליומן.
//
// מאחורי אותו שער של `/admin`: כאן יושבים הפרומפטים המלאים, ההדמיות והטקסט
// החופשי שלקוחות כתבו. השער האמיתי הוא `requireAdmin` על מסלולי ה-API —
// העטיפה כאן היא כדי שהעמוד יציג טופס כניסה במקום יומן ריק.
//
// היומן עצמו הוא הרכיב המשותף `RunsLog`, שמוצג גם ב-`/admin/runs`.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { he } from "@/i18n/he";
import { AdminGate } from "@/components/admin/AdminGate";
import RunsLog, { Diagnostics, PromptDialog, type RunDebug } from "@/components/admin/RunsLog";

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export default function DebugPage() {
  return (
    <AdminGate>
      <DebugConsole />
    </AdminGate>
  );
}

function DebugConsole() {
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
  /** הפרומפט של ההרצה החיה, כפי שהשרת מדווח שנשלח בפועל. */
  const [runPrompt, setRunPrompt] = useState<string | null>(null);
  const [showRunPrompt, setShowRunPrompt] = useState(false);

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
    setRunPrompt(null);
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
      setRunPrompt(data.renderPrompt ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** "הרץ מחדש" מהיומן: ההדמיה של ההרצה נטענת לטופס וכל הצינור רץ עליה שוב. */
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
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold">{he.site.adminNavLab} — צינור תמונה→SVG</h1>
        <Link href="/admin" className="text-[13px] text-cobalt hover:underline">
          → {he.site.adminBackHome}
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <button className={`rounded-[2px] px-4 py-1.5 ${view === "run" ? "bg-graphite text-white" : "border border-graphite/20"}`}
          onClick={() => setView("run")}>הרצה</button>
        <button className={`rounded-[2px] px-4 py-1.5 ${view === "log" ? "bg-graphite text-white" : "border border-graphite/20"}`}
          onClick={() => setView("log")}>{he.site.adminNavRuns}</button>
      </div>

      {view === "log" && <RunsLog onRerun={(url) => void openInDebug(url)} />}

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
              <option value="dark">dark (מתכת כהה — כמו ההדמיות שנוצרות)</option>
              <option value="saturation">saturation</option>
            </select>
          </label>
          <button className="rounded-[2px] bg-graphite px-5 py-1.5 text-white disabled:opacity-60" disabled={busy} onClick={() => void run()}>
            {busy ? `מריץ… ${elapsed}s` : "הרץ"}
          </button>
          {runPrompt && (
            <button
              type="button"
              className="rounded-[2px] border border-cobalt px-3 py-1.5 text-cobalt hover:bg-cobalt/5"
              onClick={() => setShowRunPrompt(true)}
            >
              הפרומפט שנשלח
            </button>
          )}
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
          svgName="lab-run"
        />
      )}

      {view === "run" && result && !debug && (
        <div className="rounded-[2px] border border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 font-semibold text-amber-800">אין פירוק שלבים — תגובת המנוע הגולמית:</div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {/* אותו חלון על ההרצה החיה — הפרומפט חוזר עם התשובה, בלי סיבוב נוסף. */}
      {showRunPrompt && (
        <PromptDialog
          subtitle="ההרצה הנוכחית"
          userPrompt={prompt || null}
          imageUrl={image}
          inputs={{
            productType,
            widthMm: heightMm,
            colorKey,
            imageUpload: Boolean(image),
          }}
          renderPrompt={runPrompt}
          state="ready"
          onClose={() => setShowRunPrompt(false)}
        />
      )}
    </div>
  );
}
