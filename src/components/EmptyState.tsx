"use client";

import { he } from "@/i18n/he";

export function EmptyState({ onExample }: { onExample: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">{he.emptyTitle}</h2>
      <p className="max-w-md text-sm text-ink60">{he.emptyBody}</p>
      <div className="flex flex-col gap-2">
        {he.examplePrompts.map((p) => (
          <button
            key={p}
            className="rounded-[2px] border border-graphite/20 bg-white px-4 py-2 text-sm text-ink80 hover:bg-porcelain"
            onClick={() => onExample(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
