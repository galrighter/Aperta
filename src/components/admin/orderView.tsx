"use client";

// חלקי התצוגה של הזמנה, במקום אחד: התווית של הסטטוס, הגיל, פירוט המחיר וקבצי
// הייצור. הם מופיעים גם בשורת התור וגם במסך ההזמנה הבודדת, ושני מקומות שמציירים
// סטטוס אחרת הם שני מקומות שמתחזקים אחרת.
import { useState } from "react";
import { he } from "@/i18n/he";
import type { OrderRow, OrderStatus } from "@/lib/db/orders";
import { daysInStatus, isStuck } from "@/lib/orders/queue";

const s = he.site;
const d = he.design;

export const statusLabel: Record<OrderStatus, string> = {
  sent: s.adminOrderStatusSent,
  approved: s.adminOrderStatusApproved,
  in_production: s.adminOrderStatusProduction,
  shipped: s.adminOrderStatusShipped,
  cancelled: s.adminOrderStatusCancelled,
};

export const statusColor: Record<OrderStatus, string> = {
  sent: "bg-[#315bff]/20 text-[#204acc]",
  approved: "bg-blue-100 text-blue-700",
  in_production: "bg-amber-100 text-amber-800",
  shipped: "bg-green-100 text-green-800",
  cancelled: "bg-stonesoft text-ink60",
};

export const money = (n: number) => `${d.ils}${n}`;
export const mm = (n: number | null) => (n == null ? "—" : `${Math.round(Number(n) * 10) / 10}`);

export const itemName = (o: OrderRow) => (o.product_type === "ring" ? d.ringName : d.braceletName);

/** "היום" / "יום" / "יומיים" / "N ימים" — עברית תקינה למספרים הקטנים שמופיעים
 *  בפועל, ולא "1 ימים" שנקרא כמו תקלה. */
export function ageText(days: number): string {
  const n = Math.floor(days);
  if (n < 1) return s.adminOrderToday;
  if (n === 1) return s.adminOrderDay;
  if (n === 2) return s.adminOrderTwoDays;
  return `${n} ${s.adminOrderDays}`;
}

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-[2px] px-2 py-0.5 text-[12px] font-medium ${statusColor[status]}`}>
      {statusLabel[status]}
    </span>
  );
}

/** גיל ההזמנה בסטטוס הנוכחי. תקועה מסומנת — זה כל תפקידו של השדה הזה. */
export function AgeChip({ order, now }: { order: OrderRow; now?: number }) {
  const stuck = isStuck(order, now);
  return (
    <span
      className={`text-[12px] ${stuck ? "font-medium text-[#c0413b]" : "text-mist"}`}
      title={`${s.adminOrderInStatus}: ${ageText(daysInStatus(order, now))}`}
    >
      {ageText(daysInStatus(order, now))}
      {stuck ? ` · ${s.adminOrderStuckMark}` : ""}
    </span>
  );
}

/** פירוט המחיר. המע"מ מופיע כ"מזה" ולא כמחובר, כי הוא כלול בסכום. */
export function PriceBlock({ price }: { price: OrderRow["price"] }) {
  if (!price) return <div className="text-[13px] text-mist">—</div>;
  return (
    <>
      <div className="font-display text-lg font-bold text-graphite">{money(price.total)}</div>
      <div className="text-[12px] text-mist">
        {money(price.base)}
        {price.widthAdd ? ` + ${money(price.widthAdd)}` : ""}
        {price.complexity
          ? ` ${price.complexity > 0 ? "+" : "−"} ${money(Math.abs(price.complexity))}`
          : ""}
        {` + ${money(price.shipping)}`}
      </div>
      <div className="text-[12px] text-mist">
        {s.adminOrderVat} {money(price.vat)}
      </div>
    </>
  );
}

/**
 * קבצי הייצור של ההזמנה (docs/TODO.md D3). מבקש במפורש את **הגרסה שהוזמנה**,
 * לא את הנוכחית: אחרי ההזמנה אפשר להמשיך לערוך את העיצוב.
 */
export function OrderFiles({
  designId,
  versionId,
}: {
  designId: string;
  versionId: string | null;
}) {
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
