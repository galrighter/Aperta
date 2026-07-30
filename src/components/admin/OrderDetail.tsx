"use client";

// מסך הזמנה בודדת (docs/TODO.md D4.1).
//
// עד עכשיו כל מה שידוע על הזמנה היה דחוס לכרטיס ברשימה: כדי לראות הזמנה אחת
// היה צריך לקרוא את כולן, ולא היה קישור שאפשר לשמור או לשלוח. כאן הכול במקום
// אחד עם כתובת — הפרטים, מסלול הסטטוסים, ההערה הפנימית וקבצי החיתוך.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { he } from "@/i18n/he";
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from "@/lib/db/orders";
import { daysInStatus } from "@/lib/orders/queue";
import StatusMoveDialog from "./StatusMoveDialog";
import {
  AgeChip,
  OrderFiles,
  PriceBlock,
  StatusPill,
  ageText,
  itemName,
  mm,
  statusLabel,
} from "./orderView";

const s = he.site;
const d = he.design;

type PatchResult = {
  order: OrderRow;
  changed: boolean;
  notified: boolean;
  notifyError: string | null;
};

export default function OrderDetail({
  id,
  onAuthLost,
}: {
  id: string;
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${id}`);
    if (res.status === 401) return onAuthLost("out");
    if (res.status === 404) return setError(s.adminOrderNotFound);
    if (res.status === 503) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      if (body?.error?.code === "schema_outdated") return setError(s.adminOrdersSchema);
      return onAuthLost("disabled");
    }
    if (!res.ok) return setError(s.adminOrderLoadError);
    const body = (await res.json()) as { order: OrderRow };
    setOrder(body.order);
    setError(null);
  }, [id, onAuthLost]);

  useEffect(() => {
    void load();
  }, [load]);

  /** מעבר סטטוס אחרי אישור בדיאלוג. `notify` מגיע משם ולא מכאן. */
  async function move(notify: boolean) {
    if (!target) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: target, notify }),
    });
    setBusy(false);
    setTarget(null);
    if (!res.ok) {
      setNotice(s.adminOrderStatusError);
      return;
    }
    const body = (await res.json()) as PatchResult;
    setOrder(body.order);
    setNotice(
      !body.changed
        ? s.adminOrderNoChange
        : body.notifyError
          ? s.adminOrderNotifyFailed
          : body.notified
            ? s.adminOrderNotifySent
            : s.adminOrderUpdated,
    );
  }

  if (error) return <ErrorBlock message={error} />;
  if (!order) return <p className="text-ink60">{he.loading}</p>;

  const ring = order.product_type === "ring";
  const address = [order.street, order.city, order.zip].filter(Boolean).join(", ");

  return (
    <div>
      <Link href="/admin/orders" className="text-[13px] text-ink60 hover:text-graphite">
        {s.adminOrderBack}
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-[22px] font-bold tracking-[0.12em] text-cobalt" dir="ltr">
          {order.ref ?? "—"}
        </h1>
        <StatusPill status={order.status} />
        <AgeChip order={order} />
        <span className="text-[12px] text-mist">
          {s.adminOrderCreated} {new Date(order.created_at).toLocaleDateString("he-IL")}
        </span>
      </div>

      {notice && (
        <p className="mt-4 rounded-[2px] border border-graphite/10 bg-porcelain px-3 py-2 text-sm text-ink80">
          {notice}
        </p>
      )}

      {/* מעבר סטטוס. הבחירה אינה שומרת בעצמה — האישור הוא מסך נפרד, כי משם
          יוצא מייל ללקוחה. */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-graphite/10 py-3">
        <span className="text-[13px] text-ink60">{s.adminOrderStatusLabel}:</span>
        <select
          value={target ?? order.status}
          onChange={(e) => setTarget(e.target.value as OrderStatus)}
          className="rounded-[2px] border border-graphite/20 bg-white px-3 py-1.5 text-sm"
        >
          {ORDER_STATUSES.map((st) => (
            <option key={st} value={st}>
              {statusLabel[st]}
            </option>
          ))}
        </select>
        {target && target !== order.status && (
          <span className="text-[12px] text-mist">{s.adminOrderNoUndo}</span>
        )}
        <p className="w-full text-[12px] text-mist sm:w-auto sm:flex-1 sm:text-left">
          {s.adminOrderMailNote}
        </p>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="text-[12px] text-mist">{s.adminOrderCustomer}</h2>
          <div className="mt-1 font-medium text-graphite">{order.name}</div>
          <a href={`mailto:${order.email}`} className="block text-[13px] text-ink60 hover:underline">
            <bdi>{order.email}</bdi>
          </a>
          {order.phone && (
            <a href={`tel:${order.phone}`} className="block text-[13px] text-ink60 hover:underline">
              <bdi>{order.phone}</bdi>
            </a>
          )}
          <h2 className="mt-4 text-[12px] text-mist">{s.adminOrderAddress}</h2>
          <div className="text-[13px] text-ink80">{address || s.adminOrderNoAddress}</div>
        </section>

        <section>
          <h2 className="text-[12px] text-mist">{s.adminOrderItem}</h2>
          <div className="mt-1 text-sm text-graphite">{itemName(order)}</div>
          <div className="text-[13px] text-ink60">
            {mm(order.circumference_mm)} × {mm(order.width_mm)} {d.mm}
            {!ring && order.fit ? ` · ${d.fits[order.fit]}` : ""}
          </div>
          {order.cuts != null && <div className="text-[13px] text-ink60">{order.cuts} חיתוכים</div>}
          <h2 className="mt-4 text-[12px] text-mist">{s.adminOrderPrice}</h2>
          <PriceBlock price={order.price} />
        </section>
      </div>

      {order.brief && (
        <section className="mt-6 border-t border-graphite/10 pt-4">
          <h2 className="text-[12px] text-mist">{s.adminOrderBrief}</h2>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink80">{order.brief}</p>
        </section>
      )}

      <section className="mt-6 border-t border-graphite/10 pt-4">
        <h2 className="text-[12px] text-mist">{s.adminOrderFiles}</h2>
        <div className="mt-1">
          {order.design_id ? (
            <>
              <OrderFiles designId={order.design_id} versionId={order.version_id} />
              {/* ההדמיה שהלקוחה רואה — מה שצריך כדי לענות על "זה לא מה שהזמנתי". */}
              <a
                href={`/design?resume=${order.design_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[13px] text-cobalt hover:underline"
              >
                {s.adminOrderDesignLink}
              </a>
            </>
          ) : (
            <span className="text-[13px] text-mist">{s.adminOrderNoDesign}</span>
          )}
        </div>
      </section>

      <NoteEditor order={order} onSaved={setOrder} onAuthLost={onAuthLost} />

      <History order={order} />

      {target && target !== order.status && (
        <StatusMoveDialog
          // מפתח לפי היעד: החלפת יעד מאפסת את הבחירה "לשלוח ללקוחה", ולא
          // משאירה סימון שנקבע עבור נוסח אחר.
          key={target}
          orders={[order]}
          target={target}
          busy={busy}
          onConfirm={(notify) => void move(notify)}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div>
      <Link href="/admin/orders" className="text-[13px] text-ink60 hover:text-graphite">
        {s.adminOrderBack}
      </Link>
      <p className="mt-3 text-sm text-[#c0413b]">{message}</p>
    </div>
  );
}

/**
 * ההערה הפנימית (D4.3). השדה והמסלול היו קיימים מהיום הראשון ולא היו חשופים
 * בשום מקום — וזה מה שמפריד בין "עדכנתי סטטוס" ל"למה".
 */
function NoteEditor({
  order,
  onSaved,
  onAuthLost,
}: {
  order: OrderRow;
  onSaved: (o: OrderRow) => void;
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  const [text, setText] = useState(order.note ?? "");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");

  async function save() {
    setState("busy");
    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // מחרוזת ריקה נשמרת כ-null: "אין הערה" הוא מצב אחד ולא שניים.
      body: JSON.stringify({ note: text.trim() ? text : null }),
    });
    if (res.status === 401) return onAuthLost("out");
    if (!res.ok) {
      setState("error");
      return;
    }
    const body = (await res.json()) as { order: OrderRow };
    onSaved(body.order);
    setState("saved");
  }

  const dirty = (order.note ?? "") !== text;

  return (
    <section className="mt-6 border-t border-graphite/10 pt-4">
      <h2 className="text-[12px] text-mist">{s.adminOrderNote}</h2>
      <p className="text-[12px] text-mist">{s.adminOrderNoteHint}</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState("idle");
        }}
        rows={3}
        className="mt-2 w-full rounded-[2px] border border-graphite/20 bg-white px-3 py-2 text-sm outline-none focus:border-[#315bff] focus:ring-2 focus:ring-[#315bff]/20"
      />
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || state === "busy"}
          className="rounded-[2px] border border-graphite/20 px-3 py-1.5 text-[13px] hover:bg-porcelain disabled:opacity-40"
        >
          {state === "busy" ? s.adminOrderNoteSaving : s.adminOrderNoteSave}
        </button>
        {state === "saved" && <span className="text-[12px] text-ink60">{s.adminOrderNoteSaved}</span>}
        {state === "error" && (
          <span className="text-[12px] text-[#c0413b]">{s.adminOrderNoteError}</span>
        )}
      </div>
    </section>
  );
}

/** מסלול ההזמנה: כל מעבר, בסדר שקרה. `status_history` נשמר מהיום הראשון. */
function History({ order }: { order: OrderRow }) {
  const history = order.status_history ?? [];
  if (history.length === 0) return null;
  return (
    <section className="mt-6 border-t border-graphite/10 pt-4">
      <h2 className="text-[12px] text-mist">{s.adminOrderHistory}</h2>
      <ol className="mt-2 grid gap-1">
        {history.map((h, i) => (
          <li key={`${h.status}-${h.at}-${i}`} className="flex flex-wrap items-baseline gap-2">
            <StatusPill status={h.status} />
            <span className="text-[13px] text-ink60">
              {new Date(h.at).toLocaleString("he-IL")}
            </span>
            {i === history.length - 1 && (
              <span className="text-[12px] text-mist">
                · {ageText(daysInStatus(order))} {s.adminOrderInStatus}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
