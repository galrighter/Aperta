"use client";

// אישור מעבר סטטוס, עם הנוסח שהלקוחה תקבל — לפני שהוא נשלח.
//
// למה דיאלוג ולא סתם `<select>` ששומר: ההודעה יוצאת ללקוחה ואין לה undo (D4.5).
// תפריט שגם מזיז סטטוס וגם שולח מייל באותה תנועה הוא תפריט שאי אפשר לגעת בו
// בלי לחשוב, ולכן בפועל לא נוגעים בו — וזה בדיוק מה שמשאיר סטטוסים ישנים.
//
// התצוגה המקדימה מגיעה מ-`orderStatusMail` עצמו ולא מניסוח שני שנכתב למסך:
// מה שרואים כאן הוא בדיוק מה שיישלח, כי זו אותה פונקציה.
import { useState } from "react";
import { he } from "@/i18n/he";
import type { OrderRow, OrderStatus } from "@/lib/db/orders";
import { orderStatusMail } from "@/lib/mailTemplates";
import { statusLabel } from "./orderView";

const s = he.site;

export default function StatusMoveDialog({
  orders,
  target,
  busy,
  onConfirm,
  onClose,
}: {
  /** ההזמנות שעוברות. אחת מהמסך הבודד, או המסומנות מהתור. */
  orders: OrderRow[];
  target: OrderStatus;
  busy: boolean;
  onConfirm: (notify: boolean) => void;
  onClose: () => void;
}) {
  const first = orders[0];
  // הנוסח נגזר מהסטטוס **היעד**, לא מזה שההזמנה נמצאת בו כרגע.
  const preview = first ? orderStatusMail(first, target) : null;
  // ברירת המחדל היא לשלוח כשיש מה לשלוח: מי שהזיז סטטוס בכוונה בדרך כלל רוצה
  // שהלקוחה תדע. הצ'קבוקס הוא הדרך לומר "לא הפעם", ולא משימה נוספת.
  const [notify, setNotify] = useState(Boolean(preview));
  const bulk = orders.length > 1;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={bulk ? s.adminOrderBulkTitle : s.adminOrderMoveTitle}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-[2px] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-semibold text-graphite">
          {bulk ? s.adminOrderBulkTitle : s.adminOrderMoveTitle}
        </h2>
        <p className="mt-1 text-[13px] text-ink60">
          {bulk
            ? `${orders.length} ${s.adminOrderSelectedCount} · ${s.adminOrderMoveTo} ${statusLabel[target]}`
            : `${first?.ref ?? ""} · ${s.adminOrderMoveTo} ${statusLabel[target]}`}
        </p>

        <div className="mt-4 border-t border-graphite/10 pt-4">
          {preview ? (
            <>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#315bff]"
                />
                <span>
                  <span className="text-sm text-graphite">{s.adminOrderNotifyAsk}</span>
                  <span className="mt-0.5 block text-[12px] text-mist">{s.adminOrderNoUndo}</span>
                </span>
              </label>

              {notify && (
                <div className="mt-3">
                  <div className="mb-1 text-[12px] font-medium text-ink60">
                    {s.adminOrderNotifyPreview}
                    {bulk ? ` · ${s.adminOrderNotifyPreviewBulk}` : ""}
                  </div>
                  <div className="rounded-[2px] border border-graphite/10 bg-porcelain p-3">
                    <div className="text-[13px] font-semibold text-graphite">{preview.subject}</div>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[13px] text-ink80">
                      {preview.text}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[13px] text-ink60">{s.adminOrderNotifyNone}</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[2px] border border-graphite/20 px-4 py-2 text-sm text-ink60 hover:bg-porcelain disabled:opacity-50"
          >
            {s.adminOrderCancelAction}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(notify && Boolean(preview))}
            disabled={busy}
            className="rounded-[2px] bg-graphite px-5 py-2 text-sm font-medium text-porcelain hover:bg-graphite/90 disabled:opacity-50"
          >
            {busy ? s.adminOrderWorking : s.adminOrderConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
