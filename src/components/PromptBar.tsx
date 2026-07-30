"use client";

import { useRef, useState } from "react";
import { he } from "@/i18n/he";
import { useStudio, currentVersion } from "@/lib/client/store";
import { buildCompositePng, fileToDataUrl } from "@/lib/client/composite";

export function PromptBar() {
  const s = useStudio();
  const [prompt, setPrompt] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const design = s.design;
  const version = currentVersion(s);
  const busy = s.genStatus === "generating" || s.genStatus === "validating" || s.genStatus === "repairing";

  if (!design) return null;

  const send = async (text?: string) => {
    const p = (text ?? prompt).trim();
    if (!p || busy) return;
    const images: Array<{ kind: "inspiration" | "annotation"; dataUrl: string }> = [];
    if (attachment) images.push({ kind: "inspiration", dataUrl: attachment });
    if (s.annotations.length > 0 && version) {
      const png = await buildCompositePng(design, version, s.annotations);
      images.push({ kind: "annotation", dataUrl: png });
    }
    const ok = await s.generate(p, images);
    if (ok) {
      setPrompt("");
      setAttachment(null);
    }
  };

  const convert = async () => {
    if (!attachment || busy) return;
    const ok = await s.vectorize(attachment);
    if (ok) setAttachment(null);
  };

  const statusText =
    s.genStatus === "generating"
      ? he.statusGenerating
      : s.genStatus === "validating"
        ? he.statusValidating
        : s.genStatus === "repairing"
          ? he.statusRepairing
          : s.genStatus === "error"
            ? (s.genError ?? he.statusError)
            : null;

  return (
    <footer className="border-t border-graphite/10 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {s.annotations.length > 0 && (
        <div className="px-1 pb-1 text-xs text-rose-600">{he.annotationsWillBeSent}</div>
      )}
      {statusText && (
        <div className={`px-1 pb-1 text-xs ${s.genStatus === "error" ? "text-red-600" : "text-ink60"}`}>
          {busy && <span className="me-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-graphite/20 border-t-cobalt align-middle" />}
          {statusText}
          {s.genStatus === "error" && (
            <button className="ms-2 rounded bg-porcelain px-2 py-0.5 hover:bg-stonesoft" onClick={() => void send()}>
              {he.retry}
            </button>
          )}
        </div>
      )}
      {attachment && (
        <div className="px-1 pb-1">
          <button
            className="w-full rounded-[2px] border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
            title={he.convertToSvgHint}
            disabled={busy}
            onClick={() => void convert()}
          >
            ✨ {he.convertToSvg}
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          className={`relative h-10 w-10 shrink-0 rounded-[2px] border text-lg ${attachment ? "border-rose-400 bg-rose-50" : "border-graphite/10 hover:bg-porcelain"}`}
          title={he.attachImage}
          onClick={() => fileRef.current?.click()}
        >
          📎
          {attachment && (
            <span
              className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-[2px] bg-rose-600 text-[10px] text-white"
              onClick={(e) => {
                e.stopPropagation();
                setAttachment(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              ✕
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setAttachment(await fileToDataUrl(f));
          }}
        />
        <textarea
          className="max-h-32 min-h-10 flex-1 resize-none rounded-[2px] border border-graphite/20 px-3 py-2 text-sm focus:border-cobalt focus:outline-none"
          rows={1}
          placeholder={he.promptPlaceholder}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="h-10 shrink-0 rounded-[2px] bg-graphite px-4 text-sm text-white hover:bg-graphite/90 disabled:opacity-40"
          disabled={busy || !prompt.trim()}
          onClick={() => void send()}
        >
          {he.send}
        </button>
      </div>
    </footer>
  );
}
