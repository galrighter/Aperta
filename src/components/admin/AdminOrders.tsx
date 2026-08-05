"use client";

// ההזמנות — תור עבודה, ולא רשימה כרונולוגית (docs/TODO.md D4.2).
//
// המסך הקודם הראה את כל ההזמנות לפי תאריך, כל אחת ככרטיס מלא. זה עונה על
// "מה הוזמן", אבל השאלה שנשאלת בבוקר היא **מה תקוע**: מה חדש וממתין לתשובה, מה
// אושר ולא נחתך, מה יושב בייצור יותר מדי זמן. לכן ברירת המחדל היא תור מקובץ לפי
// סטטוס בסדר דחיפות, השורה קומפקטית, וכל הפרטים עברו למסך ההזמנה הבודדת שיש לו
// כתובת משל עצמו.
//
// "כל ההזמנות" נשארה בלשונית שנייה: היא התשובה לשאלה אחרת — למצוא הזמנה
// מסוימת, כולל מבוטלות, שאינן חלק מהתור.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { he } from "@/i18n/he";
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from "@/lib/db/orders";
import { buildQueue } from "@/lib/orders/queue";
import StatusMoveDialog from "./StatusMoveDialog";
import { AgeChip, StatusPill, itemName, mm, money, statusLabel } from "./orderView";

const s = he.site;
const d = he.design;

type View = "queue" | "all";

export default function AdminOrders({
  onAuthLost,
}: {
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [view, setView] = useState<View>("queue");
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  /** המסומנות לפעולה מרוכזת (D4.4). */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<OrderStatus | "">("");
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (status: OrderStatus | "") => {
      setLoading(true);
      const res = await fetch(`/api/orders${status ? `?status=${status}` : ""}`);
      setLoading(false);
      if (res.status === 401) return onAuthLost("out");
      if (res.status === 503) {
        // 503 כאן הוא או "אין ADMIN_TOKEN" או "המיגרציה לא רצה" — שני מצבים
        // שונים לגמרי, ולכן מפרידים לפי הקוד ולא לפי הסטטוס.
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        if (body?.error?.code === "schema_outdated") {
          setError(s.adminOrdersSchema);
          return;
        }
        return onAuthLost("disabled");
      }
      if (!res.ok) {
        setError(s.adminOrdersError);
        return;
      }
      const body = (await res.json()) as { orders: OrderRow[] };
      setOrders(body.orders);
      setError(null);
    },
    [onAuthLost],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינת נתונים באפקט. הכלל מסמן את **הקריאה**, לא setState סינכרוני — הטוען פותח ב-await; התיקון האמיתי הוא שכבת נתונים, לא שינוי מקומי. ראו eslint.config.mjs.
    void load("");
  }, [load]);

  const queue = useMemo(() => buildQueue(orders), [orders]);
  const pickedOrders = useMemo(() => orders.filter((o) => picked.has(o.id)), [orders, picked]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function switchView(v: View) {
    setView(v);
    setPicked(new Set());
    setNotice(null);
    if (v === "queue" && filter) {
      setFilter("");
      void load("");
    }
  }

  function applyFilter(f: OrderStatus | "") {
    setFilter(f);
    setPicked(new Set());
    void load(f);
  }

  /**
   * הפעולה המרוכזת. בקשה לכל הזמנה, בזו אחר זו — אין עדכון קבוצתי במסד, ומה
   * שחשוב כאן הוא ש**כל** הזמנה תקבל את ההיסטוריה שלה ואת ההחלטה על המייל.
   * בסדרה ולא במקביל: המיילים יוצאים בקצב שאפשר להסביר, ותקלה באחת אינה
   * מפילה את השאר.
   */
  async function moveMany(notify: boolean) {
    if (!target) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    let notified = 0;
    let unchanged = 0;
    for (const o of pickedOrders) {
      const res = await fetch(`/api/orders/${o.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: target, notify }),
      });
      if (!res.ok) {
        failed++;
        continue;
      }
      const body = (await res.json()) as { changed: boolean; notified: boolean };
      if (body.changed) ok++;
      else unchanged++;
      if (body.notified) notified++;
    }
    setBusy(false);
    setDialog(false);
    setPicked(new Set());
    setTarget("");
    setNotice(
      [
        `${ok} ${s.adminOrderBulkResult}`,
        unchanged ? `${unchanged} ${s.adminOrderBulkUnchanged}` : null,
        notified ? `${notified} ${s.adminOrderBulkNotified}` : null,
        failed ? `${failed} ${s.adminOrderBulkFailed}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    await load(view === "all" ? filter : "");
  }

  if (error) return <p className="text-sm text-[#c0413b]">{error}</p>;
  if (loading && orders.length === 0) return <p className="text-ink60">{he.loading}</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["queue", "all"] as const).map((v) => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors ${
              view === v ? "bg-graphite text-porcelain" : "bg-porcelain text-ink60 hover:bg-stonesoft"
            }`}
          >
            {v === "queue" ? s.adminOrdersQueue : s.adminOrdersAll}
          </button>
        ))}
      </div>

      {view === "all" && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(["", ...ORDER_STATUSES] as const).map((f) => (
            <button
              key={f || "all"}
              onClick={() => applyFilter(f)}
              className={`rounded-[2px] px-3 py-1 text-[13px] transition-colors ${
                filter === f
                  ? "border border-graphite bg-white text-graphite"
                  : "border border-transparent bg-porcelain text-ink60 hover:bg-stonesoft"
              }`}
            >
              {f === "" ? s.adminFilterAll : statusLabel[f]}
            </button>
          ))}
        </div>
      )}

      <p className="mb-4 text-[13px] text-mist">{s.adminOrderMailNote}</p>

      {notice && (
        <p className="mb-4 rounded-[2px] border border-graphite/10 bg-porcelain px-3 py-2 text-sm text-ink80">
          {notice}
        </p>
      )}

      {orders.length === 0 ? (
        <div>
          <p className="text-ink60">{s.adminOrdersEmpty}</p>
          <p className="mt-2 text-[13px] text-mist">{s.adminOrdersLegacy}</p>
        </div>
      ) : view === "queue" ? (
        queue.length === 0 ? (
          <p className="text-ink60">{s.adminQueueEmpty}</p>
        ) : (
          <div className="grid gap-6">
            {queue.map((bucket) => (
              <section key={bucket.status}>
                <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-graphite/10 pb-1">
                  <StatusPill status={bucket.status} />
                  <span className="text-[13px] text-ink60">{bucket.orders.length}</span>
                  {bucket.stuck > 0 && (
                    <span className="text-[12px] font-medium text-[#c0413b]">
                      ·{" "}
                      {bucket.stuck === 1
                        ? s.adminQueueStuckOne
                        : `${bucket.stuck} ${s.adminQueueStuck}`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        const all = bucket.orders.every((o) => next.has(o.id));
                        for (const o of bucket.orders) {
                          if (all) next.delete(o.id);
                          else next.add(o.id);
                        }
                        return next;
                      })
                    }
                    className="text-[12px] text-lapis hover:underline"
                  >
                    {bucket.orders.every((o) => picked.has(o.id))
                      ? s.adminOrderClearSelection
                      : s.adminOrderSelectAll}
                  </button>
                </div>
                <div className="grid gap-1.5">
                  {bucket.orders.map((o) => (
                    <OrderLine
                      key={o.id}
                      order={o}
                      picked={picked.has(o.id)}
                      onPick={() => toggle(o.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
            <p className="text-[13px] text-mist">{s.adminOrdersLegacy}</p>
          </div>
        )
      ) : (
        <div className="grid gap-1.5">
          {orders.map((o) => (
            <OrderLine
              key={o.id}
              order={o}
              picked={picked.has(o.id)}
              onPick={() => toggle(o.id)}
              showStatus
            />
          ))}
          <p className="mt-2 text-[13px] text-mist">{s.adminOrdersLegacy}</p>
        </div>
      )}

      {/* סרגל הפעולה המרוכזת. צף למטה כדי שהוא יישאר בהישג יד גם ברשימה
          ארוכה — הסימון קורה למעלה והפעולה למטה. */}
      {picked.size > 0 && (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-2 border-t border-graphite/20 bg-white/95 py-3 backdrop-blur">
          <span className="text-sm text-graphite">
            {picked.size} {s.adminOrderSelectedCount}
          </span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as OrderStatus | "")}
            className="rounded-[2px] border border-graphite/20 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">{s.adminOrderBulkMoveTo}</option>
            {ORDER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {statusLabel[st]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!target}
            onClick={() => setDialog(true)}
            className="rounded-[2px] bg-graphite px-4 py-1.5 text-sm font-medium text-porcelain hover:bg-graphite/90 disabled:opacity-40"
          >
            {s.adminOrderConfirm}
          </button>
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="text-[13px] text-ink60 hover:text-graphite"
          >
            {s.adminOrderClearSelection}
          </button>
        </div>
      )}

      {dialog && target && (
        <StatusMoveDialog
          key={target}
          orders={pickedOrders}
          target={target}
          busy={busy}
          onConfirm={(notify) => void moveMany(notify)}
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  );
}

/**
 * שורת הזמנה בתור. קומפקטית בכוונה: כל מה שנדרש כדי להחליט אם לפתוח אותה —
 * מספר, לקוחה, מה הוזמן, כמה זמן היא יושבת, והאם יש עליה הערה.
 */
function OrderLine({
  order,
  picked,
  onPick,
  showStatus = false,
}: {
  order: OrderRow;
  picked: boolean;
  onPick: () => void;
  showStatus?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border bg-white px-3 py-2 transition-colors ${
        picked ? "border-lapis" : "border-graphite/10"
      }`}
    >
      <input
        type="checkbox"
        checked={picked}
        onChange={onPick}
        aria-label={order.ref ?? order.name}
        className="h-4 w-4 accent-[#3f6297]"
      />
      <Link
        href={`/admin/orders/${order.id}`}
        className="font-display text-[13px] font-bold tracking-[0.14em] text-lapis hover:underline"
        dir="ltr"
      >
        {order.ref ?? order.id.slice(0, 8)}
      </Link>
      <span className="min-w-0 flex-1 truncate text-sm text-graphite">{order.name}</span>
      <span className="text-[13px] text-ink60">
        {itemName(order)} · {mm(order.circumference_mm)}×{mm(order.width_mm)} {d.mm}
      </span>
      {order.price && <span className="text-[13px] text-ink80">{money(order.price.total)}</span>}
      {showStatus && <StatusPill status={order.status} />}
      <AgeChip order={order} />
      {order.note && (
        <span
          className="rounded-[2px] bg-porcelain px-1.5 py-0.5 text-[11px] text-ink60"
          title={order.note}
        >
          {s.adminOrderNoteFlag}
        </span>
      )}
      <Link href={`/admin/orders/${order.id}`} className="text-[12px] text-lapis hover:underline">
        {s.adminOrderOpen}
      </Link>
    </div>
  );
}
