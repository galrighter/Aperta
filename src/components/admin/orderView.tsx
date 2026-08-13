"use client";

// חלקי התצוגה של הזמנה, במקום אחד: התווית של הסטטוס, הגיל, פירוט המחיר וקבצי
// הייצור. הם מופיעים גם בשורת התור וגם במסך ההזמנה הבודדת, ושני מקומות שמציירים
// סטטוס אחרת הם שני מקומות שמתחזקים אחרת.
import { he } from "@/i18n/he";
import type { OrderRow, OrderStatus } from "@/lib/db/orders";
import { daysInStatus, isStuck } from "@/lib/orders/queue";
import ExportFiles from "./ExportFiles";

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
  sent: "bg-[#3f6297]/20 text-[#2c4a76]",
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
        {/* רוחב ומורכבות מופיעים בהזמנות שנשלחו לפני המחיר הקבוע בלבד — שם הם
            נגבו, ולכן הם מוצגים. בהזמנה חדשה הם חסרים ולא נכתבת שורה. */}
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
  return (
    <ExportFiles
      designId={designId}
      versionId={versionId}
      note={versionId ? s.adminOrderVersionOrdered : undefined}
    />
  );
}
