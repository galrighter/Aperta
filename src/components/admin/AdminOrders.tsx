"use client";

// לשונית ההזמנות — מה שהוזמן בפועל, עם צינור סטטוסים וקישור לקבצי החיתוך.
//
// עד עכשיו הזמנה הייתה שורה ב-`inquiries` עם טקסט חופשי, ולכן המסך יכול היה
// להראות אותה אבל לא לעשות איתה כלום: אין סטטוס שאומר "בייצור", ואין דרך
// להגיע מהשורה לקובץ. כאן שלושת הדברים שהמסך צריך לתת נמצאים באותה שורה —
// מה הוזמן, איפה זה עומד, ומה חותכים.
import { useCallback, useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from "@/lib/db/orders";

const s = he.site;
const d = he.design;

const statusLabel: Record<OrderStatus, string> = {
  sent: s.adminOrderStatusSent,
  approved: s.adminOrderStatusApproved,
  in_production: s.adminOrderStatusProduction,
  shipped: s.adminOrderStatusShipped,
  cancelled: s.adminOrderStatusCancelled,
};

const statusColor: Record<OrderStatus, string> = {
  sent: "bg-[#315bff]/20 text-[#204acc]",
  approved: "bg-blue-100 text-blue-700",
  in_production: "bg-amber-100 text-amber-800",
  shipped: "bg-green-100 text-green-800",
  cancelled: "bg-stonesoft text-ink60",
};

const money = (n: number) => `${d.ils}${n}`;
const mm = (n: number | null) => (n == null ? "—" : `${Math.round(Number(n) * 10) / 10}`);

export default function AdminOrders({
  onAuthLost,
}: {
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

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
    void load("");
  }, [load]);

  async function changeStatus(id: string, status: OrderStatus) {
    setNotice(null);
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setNotice(s.adminOrderStatusError);
      return;
    }
    const body = (await res.json()) as { order: OrderRow; mailed: boolean | null };
    setOrders((prev) => prev.map((o) => (o.id === id ? body.order : o)));
    // המייל ללקוחה הוא חצי מהפעולה, ולכן "עודכן" לבדו הוא דיווח חלקי: מי
    // שהעביר ל״נשלחה״ מניח שהיא יודעת.
    if (body.mailed === true) setNotice(s.adminOrderMailed);
    else if (body.mailed === false) setNotice(s.adminOrderNotMailed);
  }

  function applyFilter(f: OrderStatus | "") {
    setFilter(f);
    void load(f);
  }

  if (error) return <p className="text-sm text-[#c0413b]">{error}</p>;
  if (loading && orders.length === 0) return <p className="text-ink60">{he.loading}</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["", ...ORDER_STATUSES] as const).map((f) => (
          <button
            key={f || "all"}
            onClick={() => applyFilter(f)}
            className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors ${
              filter === f ? "bg-graphite text-porcelain" : "bg-porcelain text-ink60 hover:bg-stonesoft"
            }`}
          >
            {f === "" ? s.adminFilterAll : statusLabel[f]}
          </button>
        ))}
      </div>

      {notice && <p className="mb-4 text-sm text-ink80">{notice}</p>}

      {orders.length === 0 ? (
        <div>
          <p className="text-ink60">{s.adminOrdersEmpty}</p>
          <p className="mt-2 text-[13px] text-mist">{s.adminOrdersLegacy}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} onStatus={changeStatus} />
          ))}
          <p className="mt-2 text-[13px] text-mist">{s.adminOrdersLegacy}</p>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  onStatus,
}: {
  order: OrderRow;
  onStatus: (id: string, status: OrderStatus) => void;
}) {
  const ring = order.product_type === "ring";
  return (
    <div className="border border-graphite/10 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[13px] font-bold tracking-[0.14em] text-cobalt" dir="ltr">
            {order.ref ?? "—"}
          </span>
          <span className="text-[12px] text-mist">
            {new Date(order.created_at).toLocaleDateString("he-IL")}
          </span>
        </div>
        <select
          value={order.status}
          onChange={(e) => onStatus(order.id, e.target.value as OrderStatus)}
          className={`rounded-[2px] px-3 py-1 text-xs font-medium ${statusColor[order.status]}`}
        >
          {ORDER_STATUSES.map((st) => (
            <option key={st} value={st}>
              {statusLabel[st]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-[12px] text-mist">{s.adminOrderCustomer}</div>
          <div className="font-medium text-graphite">{order.name}</div>
          <a href={`mailto:${order.email}`} className="block text-[13px] text-ink60 hover:underline">
            <bdi>{order.email}</bdi>
          </a>
          {order.phone && <div className="text-[13px] text-ink60"><bdi>{order.phone}</bdi></div>}
          {(order.street || order.city) && (
            <div className="text-[13px] text-ink60">
              {[order.street, order.city, order.zip].filter(Boolean).join(", ")}
            </div>
          )}
        </div>

        <div>
          <div className="text-[12px] text-mist">{s.adminOrderItem}</div>
          <div className="text-sm text-graphite">{ring ? d.ringName : d.braceletName}</div>
          <div className="text-[13px] text-ink60">
            {mm(order.circumference_mm)} × {mm(order.width_mm)} {d.mm}
            {!ring && order.fit ? ` · ${d.fits[order.fit]}` : ""}
          </div>
          {order.cuts != null && <div className="text-[13px] text-ink60">{order.cuts} חיתוכים</div>}
        </div>

        <div>
          <div className="text-[12px] text-mist">{s.adminOrderPrice}</div>
          {order.price ? (
            <>
              <div className="font-display text-lg font-bold text-graphite">
                {money(order.price.total)}
              </div>
              {/* הפירוט ולא רק הסכום — הוא נדרש לחשבונית ממילא. המע"מ מופיע
                  כ"מזה" ולא כמחובר, כי הוא כלול בסכום. */}
              <div className="text-[12px] text-mist">
                {money(order.price.base)}
                {order.price.widthAdd ? ` + ${money(order.price.widthAdd)}` : ""}
                {order.price.complexity
                  ? ` ${order.price.complexity > 0 ? "+" : "−"} ${money(Math.abs(order.price.complexity))}`
                  : ""}
                {` + ${money(order.price.shipping)}`}
              </div>
              <div className="text-[12px] text-mist">
                {s.adminOrderVat} {money(order.price.vat)}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-mist">—</div>
          )}
        </div>
      </div>

      {order.brief && (
        <div className="mt-3 border-t border-graphite/10 pt-2">
          <div className="text-[12px] text-mist">{s.adminOrderBrief}</div>
          <p className="whitespace-pre-wrap text-[13px] text-ink80">{order.brief}</p>
        </div>
      )}

      <div className="mt-3 border-t border-graphite/10 pt-2">
        {order.design_id ? (
          <OrderFiles designId={order.design_id} versionId={order.version_id} />
        ) : (
          <span className="text-[13px] text-mist">{s.adminOrderNoDesign}</span>
        )}
      </div>
    </div>
  );
}

/**
 * קבצי הייצור של ההזמנה (docs/TODO.md D3). מבקש במפורש את **הגרסה שהוזמנה**,
 * לא את הנוכחית: אחרי ההזמנה אפשר להמשיך לערוך את העיצוב.
 */
function OrderFiles({ designId, versionId }: { designId: string; versionId: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "error" | "blocked" | "none">("idle");
  const [files, setFiles] = useState<{ svgUrl: string; dxfUrl: string; warn: boolean } | null>(null);

  async function run() {
    setState("busy");
    const res = await fetch(`/api/admin/designs/${designId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      setState(
        body?.error?.code === "export_blocked"
          ? "blocked"
          : body?.error?.code === "no_version"
            ? "none"
            : "error",
      );
      return;
    }
    const body = (await res.json()) as { svgUrl: string; dxfUrl: string; validationStatus: string };
    setFiles({ svgUrl: body.svgUrl, dxfUrl: body.dxfUrl, warn: body.validationStatus === "warn" });
    setState("idle");
  }

  if (files) {
    return (
      <div>
        <div className="flex flex-wrap gap-3 text-[13px]">
          <a href={files.svgUrl} className="font-semibold text-cobalt hover:underline">
            {s.adminExportSvg}
          </a>
          <a href={files.dxfUrl} className="font-semibold text-cobalt hover:underline">
            {s.adminExportDxf}
          </a>
          {versionId && <span className="text-[12px] text-mist">· {s.adminOrderVersionOrdered}</span>}
        </div>
        {files.warn && <p className="mt-1 text-[12px] text-[#8a6d12]">{s.adminExportWarn}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "busy"}
        className="text-[13px] text-cobalt hover:underline disabled:text-mist disabled:no-underline"
      >
        {state === "busy" ? s.adminExporting : s.adminExport}
      </button>
      {state === "blocked" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportBlocked}</p>}
      {state === "none" && <p className="mt-1 text-[12px] text-mist">{s.adminExportNone}</p>}
      {state === "error" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportError}</p>}
    </div>
  );
}
