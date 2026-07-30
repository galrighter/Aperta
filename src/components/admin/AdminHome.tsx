"use client";

// מסך הבית של פורטל הניהול: מאיפה נכנסים לכל דבר, ומה דורש תשומת לב עכשיו.
//
// המספרים נטענים מהמסלולים הקיימים ולא ממסלול סיכום חדש: קריאות קלות שקורות
// פעם אחת עדיפות על נקודת קצה נוספת שצריך לתחזק, ומספר שנכשל בטעינה מוצג
// כ-"—" ולא מוריד את המסך.
//
// "יצירות שנכשלו" נעדר מכאן עד שהיומן עומד: לספור אותן דרך `/api/debug/log`
// היה אומר לשלוף את כל ההרצות עם הפרומפטים והמדדים שלהן. עכשיו יש ספירה.
import { useEffect, useState } from "react";
import Link from "next/link";
import { he } from "@/i18n/he";
import type { OrderRow } from "@/lib/db/orders";
import type { Inquiry } from "@/lib/db/inquiries";

const s = he.site;

/** הזמנה שדורשת פעולה: התקבלה או אושרה ועוד לא נשלחה. */
const OPEN_ORDER = new Set(["sent", "approved", "in_production"]);

type Counts = {
  orders: number | null;
  inquiries: number | null;
  designs: number | null;
  failedRuns: number | null;
};

const NO_COUNTS: Counts = { orders: null, inquiries: null, designs: null, failedRuns: null };

export default function AdminHome() {
  const [counts, setCounts] = useState<Counts>(NO_COUNTS);

  useEffect(() => {
    const num = async <T,>(url: string, pick: (body: T) => number): Promise<number | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return pick((await res.json()) as T);
      } catch {
        return null;
      }
    };

    void (async () => {
      const [orders, inquiries, designs, failedRuns] = await Promise.all([
        num<{ orders: OrderRow[] }>("/api/orders", (b) =>
          b.orders.filter((o) => OPEN_ORDER.has(o.status)).length,
        ),
        num<{ inquiries: Inquiry[] }>("/api/inquiries?status=new", (b) => b.inquiries.length),
        num<{ total: number }>("/api/admin/designs?limit=1", (b) => b.total),
        num<{ failed: number }>("/api/debug/log/counts", (b) => b.failed),
      ]);
      setCounts({ orders, inquiries, designs, failedRuns });
    })();
  }, []);

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-tight text-graphite">{s.adminHomeTitle}</h1>
      <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-ink60">{s.adminHomeSubtitle}</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={s.adminStatOpenOrders} value={counts.orders} href="/admin/orders" />
        <Stat label={s.adminStatNewInquiries} value={counts.inquiries} href="/admin/inquiries" />
        <Stat label={s.adminStatDesigns} value={counts.designs} href="/admin/designs" />
        {/* הסינון בכתובת, כדי שהלחיצה תגיע לשורות שהמספר מדבר עליהן. */}
        <Stat
          label={s.adminStatFailedRuns}
          value={counts.failedRuns}
          href="/admin/runs?status=problem"
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card href="/admin/orders" title={s.adminTabOrders} desc={s.adminCardOrdersDesc} />
        <Card href="/admin/runs" title={s.adminNavRuns} desc={s.adminCardRunsDesc} />
        <Card href="/admin/designs" title={s.adminTabDesigns} desc={s.adminCardDesignsDesc} />
        <Card href="/admin/inquiries" title={s.adminTabInquiries} desc={s.adminCardInquiriesDesc} />
        <Card href="/debug" title={s.adminNavLab} desc={s.adminCardLabDesc} />
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number | null; href: string }) {
  return (
    <Link
      href={href}
      className="border border-graphite/10 bg-white p-5 transition-colors hover:border-cobalt"
    >
      <div className="font-display text-[30px] leading-none text-graphite">
        {value == null ? <span className="text-mist">{s.adminStatUnavailable}</span> : value}
      </div>
      <div className="mt-2 text-[13px] text-ink60">{label}</div>
    </Link>
  );
}

function Card({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col border border-graphite/10 bg-white p-6 transition-colors hover:border-cobalt"
    >
      <span className="text-[15px] font-semibold text-graphite group-hover:text-cobalt">{title}</span>
      <span className="mt-1.5 text-[13px] leading-relaxed text-ink60">{desc}</span>
    </Link>
  );
}
