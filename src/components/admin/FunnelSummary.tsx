"use client";

// המשפך בשבוע האחרון — חמישה מספרים ואחוזי המעבר ביניהם.
//
// **למה זה המסך ולא דוח.** מה שנשאל בפועל הוא "איפה הדלי דולף": בין כניסה
// לניסיון עיצוב, בין ניסיון לגרסה, בין גרסה לצ'קאאוט, או בצ'קאאוט עצמו. ארבעה
// אחוזים עונים על זה, וכל דבר מעבר להם הוא כבר שאלה שנשאלת אחרי שהתשובה
// הזאת ידועה. הנתונים מ-`funnel_events` (0023).
//
// **ביקורים ולא אירועים.** מי שנכנסת לצ'קאאוט, חוזרת לערוך ונכנסת שוב אינה
// שתי לקוחות. הספירה שמוצגת היא לפי `session_key` — ביקורים ייחודיים — כי
// היא זו שאחוז מעבר מחושב עליה בכלל.

import { useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { FUNNEL_STEPS, type FunnelEvent } from "@/lib/db/funnel";

const s = he.site;

type Summary = {
  days: number;
  counts: Record<FunnelEvent, number>;
  sessions: Record<FunnelEvent, number>;
  sources: Array<{ source: string; count: number }>;
  devices: { mobile: number; desktop: number };
  truncated: boolean;
};

const STEP_LABEL: Record<FunnelEvent, string> = {
  page_view: s.funnelPageView,
  design_start: s.funnelDesignStart,
  first_version: s.funnelFirstVersion,
  checkout_view: s.funnelCheckout,
  order_placed: s.funnelOrder,
  share_view: s.funnelShareView,
};

export default function FunnelSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/funnel?days=7");
        if (!res.ok) return setState("error");
        const body = (await res.json()) as Summary;
        setData(body);
        // "אין נתונים" ו"נכשלה הטעינה" הם שני מצבים שונים לגמרי, ובאנליטיקס
        // ההבדל ביניהם הוא ההבדל בין אתר שקט לצינור מדידה שבור.
        setState(body.sessions.page_view > 0 ? "ok" : "empty");
      } catch {
        setState("error");
      }
    })();
  }, []);

  if (state === "loading") return null;
  if (state === "error") {
    return <p className="mt-8 text-[13px] text-mist">{s.funnelError}</p>;
  }
  if (state === "empty" || !data) {
    return (
      <section className="mt-10">
        <h2 className="text-[15px] font-semibold text-graphite">{s.funnelTitle}</h2>
        <p className="mt-1 text-[13px] text-mist">{s.funnelEmpty}</p>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[15px] font-semibold text-graphite">{s.funnelTitle}</h2>
        <span className="text-[12px] text-mist">
          {s.funnelWindow} {data.days} {s.adminOrderDays}
        </span>
        {data.truncated && <span className="text-[12px] text-amber-700">{s.funnelTruncated}</span>}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        {FUNNEL_STEPS.map((step, i) => {
          const value = data.sessions[step];
          const prev = i === 0 ? null : data.sessions[FUNNEL_STEPS[i - 1]];
          // אחוז מעבר מהשלב הקודם. `null` כשאין ממה — 0/0 אינו 0%.
          const rate = prev && prev > 0 ? Math.round((value / prev) * 100) : null;
          return (
            <div key={step} className="border border-graphite/10 bg-white p-4">
              <div className="font-display text-[26px] leading-none text-graphite">{value}</div>
              <div className="mt-1.5 text-[12px] text-ink60">{STEP_LABEL[step]}</div>
              {rate != null && (
                <div
                  className={`mt-1 text-[12px] ${rate < 20 ? "font-medium text-amber-700" : "text-mist"}`}
                >
                  {rate}% {s.funnelFromPrev}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-mist">
        <span>
          {s.funnelDevices}: {data.devices.mobile} / {data.devices.desktop}
        </span>
        <span>
          {STEP_LABEL.share_view}: {data.sessions.share_view}
        </span>
        {data.sources.length > 0 && (
          <span>
            {s.funnelSources}:{" "}
            {data.sources.map((x) => `${x.source} (${x.count})`).join(" · ")}
          </span>
        )}
      </div>
    </section>
  );
}
