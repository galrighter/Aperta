"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import { useStudio } from "@/lib/client/store";
import { ConfirmModal } from "./Modal";

export function DesignsDrawer() {
  const { drawerOpen, setDrawerOpen, designs, openDesign, deleteDesign, duplicateDesign } = useStudio();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (!drawerOpen) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerOpen(false)}>
      <aside
        className="absolute inset-y-0 start-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{he.myDesigns}</h2>
          <button className="rounded-[2px] px-2 py-1 text-ink60 hover:bg-porcelain" onClick={() => setDrawerOpen(false)}>
            ✕
          </button>
        </div>
        {designs.length === 0 && <p className="text-sm text-ink60">{he.noDesignsYet}</p>}
        <ul className="space-y-2">
          {designs.map((d) => (
            <li key={d.id} className="rounded-[2px] border border-graphite/10 p-3">
              <button className="w-full text-start" onClick={() => void openDesign(d.id)}>
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-xs text-ink60">
                  {d.product_type === "ring" ? he.ring : he.bracelet} · {Number(d.length_mm)}×{Number(d.width_mm)} מ״מ
                </div>
              </button>
              <div className="mt-2 flex gap-2 text-xs">
                <button className="rounded-[2px] bg-porcelain px-2 py-1 hover:bg-stonesoft" onClick={() => void openDesign(d.id)}>
                  {he.open}
                </button>
                <button className="rounded-[2px] bg-porcelain px-2 py-1 hover:bg-stonesoft" onClick={() => void duplicateDesign(d.id)}>
                  {he.duplicate}
                </button>
                <button className="rounded-[2px] bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100" onClick={() => setPendingDelete(d.id)}>
                  {he.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <ConfirmModal
        open={pendingDelete !== null}
        title={he.delete}
        body={he.confirmDelete}
        onConfirm={() => {
          if (pendingDelete) void deleteDesign(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
