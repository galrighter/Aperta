"use client";

import { he } from "@/i18n/he";

export function ConfirmModal(props: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.onCancel}>
      <div
        className="w-full max-w-sm rounded-[2px] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold">{props.title}</h3>
        <p className="mb-5 text-sm text-ink60">{props.body}</p>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-[2px] px-4 py-2 text-sm text-ink60 hover:bg-porcelain"
            onClick={props.onCancel}
          >
            {he.cancel}
          </button>
          <button
            className="rounded-[2px] bg-graphite px-4 py-2 text-sm text-white hover:bg-graphite/90"
            onClick={props.onConfirm}
          >
            {props.confirmLabel ?? he.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
