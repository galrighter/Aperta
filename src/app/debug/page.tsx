"use client";

// מעבדת הפרומפט.
//
// **אין כאן צינור שני.** ההרצה היא `/api/generate` — אותו מסלול בדיוק שהלקוחה
// מריצה — עם שני פרמטרים נוספים שמותרים לאדמין: הפרומפט המדויק, ומספר הפריטים
// בתמונה. כל השאר (הקופסה, החיתוך לפאנלים, המסגור, הוולידציה, שמירת הגרסה)
// זהה בהגדרה ולא בזכות משמעת.
//
// עד 30.7 היה כאן צינור נפרד (`/api/debug/run`): שורה אחת תמיד, ומעקב על
// התמונה כולה במקום חיתוך לפאנלים. הוא נמחק — מעבדה שמתנהגת אחרת מהייצור
// גובה יותר משהיא מחזירה, וזה בדיוק מה שקרה: הרצה מהאתר אובחנה כהרצה ממנו.
//
// העיצובים נשמרים תחת פרופיל `prompt-debug`, ולכן הם לא מתערבבים ברשימה של אף
// לקוחה, המכסה היומית שלהם נפרדת, וביומן אפשר לסנן אותם בלחיצה.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { he } from "@/i18n/he";
import { AdminGate } from "@/components/admin/AdminGate";
import RunsLog from "@/components/admin/RunsLog";

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

interface LabPlan {
  profileId: string;
  dims: { lengthMm: number; widthMm: number; thicknessMm: number };
  minHoleMm: number;
  plannedRows: number;
  maxRows: number;
  rows: number;
  prompt: string;
}

interface RunResult {
  runId: string;
  version: { id: string; svg: string; validation_status: string };
  candidates: Array<{ svg: string; report: { status: string } }>;
  render: { model: string | null; url: string | null };
  lengthMm: number;
  widthMm: number;
}

export default function DebugPage() {
  return (
    <AdminGate>
      <PromptLab />
    </AdminGate>
  );
}

function PromptLab() {
  const [view, setView] = useState<"lab" | "log">("lab");

  const [productType, setProductType] = useState<"bracelet" | "ring">("bracelet");
  const [lengthMm, setLengthMm] = useState(160);
  const [widthMm, setWidthMm] = useState(18);
  const [thicknessMm, setThicknessMm] = useState(1.5);
  const [brief, setBrief] = useState("");
  const [rows, setRows] = useState<number | null>(null);
  /** עריכה: ההרצה יוצאת מהתוצאה הקודמת במקום מאפס. */
  const [editing, setEditing] = useState(false);

  const [plan, setPlan] = useState<LabPlan | null>(null);
  const [prompt, setPrompt] = useState("");
  /** האם נגעת בטקסט. אחרי שנגעת, שינוי מידות לא ידרוס את מה שכתבת. */
  const [dirty, setDirty] = useState(false);

  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  /** ברירת המחדל: הפרומפט שהייצור היה בונה לאותן מידות, ומה שהתכנון בוחר. */
  const loadPlan = useCallback(
    async (opts: { keepPrompt: boolean }) => {
      try {
        const res = await fetch("/api/admin/prompt-lab", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productType, lengthMm, widthMm, thicknessMm,
            userPrompt: brief, editing, rows: rows ?? undefined,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LabPlan;
        setPlan(data);
        if (!opts.keepPrompt) {
          setPrompt(data.prompt);
          setDirty(false);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [productType, lengthMm, widthMm, thicknessMm, brief, editing, rows],
  );

  useEffect(() => {
    void loadPlan({ keepPrompt: dirty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, lengthMm, widthMm, thicknessMm, editing, rows]);

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    setElapsed(0);
    setError(null);
    const previous = result;
    setResult(null);
    try {
      // עיצוב חדש לכל הרצה, תחת פרופיל הכיול. `/api/designs` מתיר `profileId`
      // מפורש כשהוא של בודק — ולכן אין כאן צורך בעוגייה או בהרשאה מיוחדת.
      const dRes = await fetch("/api/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: plan.profileId,
          productType, lengthMm, widthMm, thicknessMm,
          name: `כיול ${new Date().toLocaleTimeString("he-IL")}`,
        }),
      });
      if (!dRes.ok) throw new Error(`יצירת עיצוב נכשלה (HTTP ${dRes.status})`);
      const { design } = (await dRes.json()) as { design: { id: string } };

      const gRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          designId: design.id,
          userPrompt: brief || "כיול פרומפט",
          promptOverride: prompt,
          rowsOverride: plan.rows,
          currentSvg: editing ? (previous?.version.svg ?? null) : null,
          images: image ? [{ kind: "inspiration", dataUrl: image }] : [],
        }),
      });
      const data = await gRes.json();
      if (!gRes.ok) throw new Error(data?.error?.message || `HTTP ${gRes.status}`);
      setResult(data as RunResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rowsShown = plan?.rows ?? 1;

  return (
    <div dir="rtl" className="mx-auto max-w-5xl p-4 text-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold">{he.site.adminNavLab} — כיול פרומפט</h1>
        <Link href="/admin" className="text-[13px] text-lapis hover:underline">
          → {he.site.adminBackHome}
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <button className={`rounded-[2px] px-4 py-1.5 ${view === "lab" ? "bg-graphite text-white" : "border border-graphite/20"}`}
          onClick={() => setView("lab")}>כיול</button>
        <button className={`rounded-[2px] px-4 py-1.5 ${view === "log" ? "bg-graphite text-white" : "border border-graphite/20"}`}
          onClick={() => setView("log")}>{he.site.adminNavRuns}</button>
      </div>

      {view === "log" && <RunsLog />}

      {view === "lab" && (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-[2px] border border-graphite/10 bg-white p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1">מוצר:
                <select className="rounded border border-graphite/20 p-1" value={productType}
                  onChange={(e) => setProductType(e.target.value as "bracelet" | "ring")}>
                  <option value="bracelet">צמיד</option>
                  <option value="ring">טבעת</option>
                </select>
              </label>
              <label className="flex items-center gap-1">אורך:
                <input type="number" className="w-20 rounded border border-graphite/20 p-1" value={lengthMm}
                  onChange={(e) => setLengthMm(Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-1">רוחב:
                <input type="number" className="w-16 rounded border border-graphite/20 p-1" value={widthMm}
                  onChange={(e) => setWidthMm(Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-1">עובי:
                <input type="number" step="0.1" className="w-16 rounded border border-graphite/20 p-1" value={thicknessMm}
                  onChange={(e) => setThicknessMm(Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-1">פריטים בתמונה:
                <input type="number" min={1} max={plan?.maxRows ?? 40}
                  className="w-16 rounded border border-graphite/20 p-1"
                  value={rowsShown}
                  onChange={(e) => setRows(Number(e.target.value) || null)} />
              </label>
              {plan && (
                <span className="text-xs text-mist">
                  התכנון בוחר {plan.plannedRows} · תקרה {plan.maxRows} (פתח מ׳ {plan.minHoleMm} מ״מ)
                </span>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-ink60">
              <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
              עריכה — ההרצה יוצאת מהתוצאה הקודמת כתמונת רפרנס
              {editing && !result && <span className="text-amber-700">(אין עדיין תוצאה קודמת)</span>}
            </label>

            <textarea
              className="min-h-14 w-full rounded-[2px] border border-graphite/20 p-2"
              placeholder="הבריף של הלקוחה — הוא מוטמע בתוך הפרומפט"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onBlur={() => void loadPlan({ keepPrompt: dirty })}
            />

            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  setImage(f ? await fileToDataUrl(f) : null);
                  setImageName(f ? f.name : null);
                }} />
              <button type="button" className="rounded-[2px] border border-graphite/20 bg-porcelain px-3 py-1.5"
                onClick={() => fileRef.current?.click()}>
                📎 תמונת השראה
              </button>
              {imageName && (
                <span className="text-xs text-ink60">{imageName}
                  <button className="ms-1 text-rose-600" onClick={() => {
                    setImage(null); setImageName(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}>✕</button>
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-2 rounded-[2px] border border-graphite/10 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">הפרומפט שיישלח למודל</span>
              <div className="flex items-center gap-2">
                {dirty && <span className="text-xs text-amber-700">נערך ידנית</span>}
                <button type="button" onClick={() => void loadPlan({ keepPrompt: false })}
                  className="rounded-[2px] border border-graphite/20 px-2 py-0.5 text-xs hover:bg-porcelain">
                  שחזר ברירת מחדל
                </button>
              </div>
            </div>
            <textarea
              dir="ltr"
              className="min-h-64 w-full rounded-[2px] border border-graphite/20 p-2 font-mono text-xs"
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setDirty(true); }}
            />
            {/* משפט ה-LAYOUT יושב בתוך הטקסט, אבל מי שחותך בפועל הוא המספר
                שלמעלה. אם ערכת אותם לכיוונים שונים — זה מוצג ולא מוסתר. */}
            <div className="text-xs text-mist">
              החיתוך בקופסה יהיה ל-{rowsShown} פריטים, ללא תלות במה שכתוב בטקסט ·
              קריאה אחת למודל (~$0.006)
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-[2px] bg-graphite px-5 py-1.5 text-white disabled:opacity-60"
              disabled={busy || !plan} onClick={() => void run()}>
              {busy ? `מריץ… ${elapsed}s` : "הרץ"}
            </button>
            {plan && (
              <span className="text-xs text-mist">
                נשמר תחת פרופיל <bdi>prompt-debug</bdi>
              </span>
            )}
          </div>

          {busy && (
            <div className="flex items-center gap-2 rounded-[2px] bg-amber-50 px-3 py-2 text-amber-800">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
              הצינור המלא רץ — הדמיה, חיתוך, וקטור, ולידציה. 30–60 שניות.
            </div>
          )}

          {error && (
            <div className="break-words rounded-[2px] border border-red-300 bg-red-50 p-3 text-red-800">
              שגיאה: {error}
            </div>
          )}

          {result && <RunOutcome result={result} onLog={() => setView("log")} />}
        </div>
      )}
    </div>
  );
}

/**
 * מה שחזר. בכוונה מצומצם: כל האבחון — השלבים, המועמדים שנדחו, הפרומפט
 * שנשלח — כבר יושב ביומן על אותה הרצה, ואין סיבה לתחזק אותו בשני מקומות.
 */
function RunOutcome({ result, onLog }: { result: RunResult; onLog: () => void }) {
  return (
    <div className="grid gap-3 rounded-[2px] border border-lapis/40 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">
          {result.candidates.length} חלופות · {Math.round(result.lengthMm)}×{result.widthMm} מ״מ
          <span className="ms-2 text-xs font-normal text-mist">
            אורך נגזר — כמה שהמודל באמת צייר
          </span>
        </div>
        <button type="button" onClick={onLog} className="text-[13px] text-lapis hover:underline">
          → ההרצה ביומן, עם השלבים והפרומפט
        </button>
      </div>

      {result.render.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.render.url} alt="ההדמיה שחזרה" className="w-full rounded bg-porcelain object-contain" />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {result.candidates.map((c, i) => (
          <div key={i} className="rounded-[2px] border border-graphite/10 p-2">
            <div className="mb-1 flex items-center justify-between text-xs text-ink60">
              <span>חלופה {i + 1}</span>
              <span className={c.report.status === "pass" ? "text-green-700" : "text-amber-700"}>
                {c.report.status}
              </span>
            </div>
            <div
              className="w-full rounded bg-[#101114] p-2 [&_svg]:w-full [&_svg]:fill-[#ffd43b] [&_svg_*]:fill-[#ffd43b]"
              dangerouslySetInnerHTML={{ __html: c.svg }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
