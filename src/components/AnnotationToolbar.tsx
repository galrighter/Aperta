"use client";

import { he } from "@/i18n/he";
import { useStudio } from "@/lib/client/store";
import type { AnnotationTool } from "@/lib/client/types";

const TOOLS: Array<{ id: AnnotationTool; label: string; icon: string }> = [
  { id: "pen", label: he.toolPen, icon: "✏️" },
  { id: "arrow", label: he.toolArrow, icon: "➤" },
  { id: "ellipse", label: he.toolEllipse, icon: "◯" },
  { id: "text", label: he.toolText, icon: "א" },
  { id: "eraser", label: he.toolEraser, icon: "⌫" },
];

export function AnnotationToolbar() {
  const { tool, setTool, annotations, clearAnnotations } = useStudio();
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-[2px] border border-graphite/10 bg-white/95 px-2 py-1 shadow-md">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          aria-label={t.label}
          className={`h-9 w-9 rounded-[2px] text-sm leading-9 ${
            tool === t.id ? "bg-rose-600 text-white" : "hover:bg-porcelain"
          }`}
          onClick={() => setTool(tool === t.id ? "none" : t.id)}
        >
          {t.icon}
        </button>
      ))}
      {annotations.length > 0 && (
        <button
          title={he.toolClearAll}
          className="h-9 rounded-[2px] px-2 text-xs text-ink60 hover:bg-porcelain"
          onClick={clearAnnotations}
        >
          {he.toolClearAll}
        </button>
      )}
    </div>
  );
}
