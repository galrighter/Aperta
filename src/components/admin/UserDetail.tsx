"use client";

// מה משתמש אחד עשה: יצירות, גרסאות, עריכות, יצירות שנכשלו, הזמנות, פניות,
// ייצוא קבצים ושיתופים — על ציר זמן אחד.
//
// **למה ציר אחד ולא שבע רשימות.** השאלה שהמסך הזה עונה עליה היא "מה קרה לו",
// והתשובה כמעט תמיד יושבת ברצף: ניסה, נכשל, ניסה שוב, ערך, הזמין. שבע רשימות
// נפרדות מכריחות לשחזר את הרצף הזה בעין, לפי חותמות זמן, בין טבלאות.
//
// **הספירות למעלה אינן ספירה של הרשימה למטה.** הן נמדדות בשרת מול הטבלאות,
// והרשימה מקוצצת. זה מכוון: "12 יצירות שנכשלו" חייב להישאר נכון גם כשהיומן
// מציג רק את 200 האירועים האחרונים. כשמשהו כן נחתך או לא נטען — זה נאמר, ולא
// מוצג כרשימה שלמה שחסר בה חלק.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAdminData } from "@/lib/client/useAdminData";
import { he } from "@/i18n/he";
import type { ActivityEvent, ActivityKind, UserActivity } from "@/lib/db/users";
import { statusLabel as orderStatusLabel } from "./orderView";
import { UserEmail, UserName, agoText, dateTime, shortDate } from "./userView";

const s = he.site;

/** התוויות של סוגי האירועים, בסדר שבו הן מוצגות במסנן. */
const KIND_LABEL: Record<ActivityKind, string> = {
  design_created: s.adminUserEventDesign,
  version: s.adminUserEventVersion,
  run_failed: s.adminUserEventRun,
  order: s.adminUserEventOrder,
  inquiry: s.adminUserEventInquiry,
  export: s.adminUserEventExport,
  share: s.adminUserEventShare,
};

const KIND_ORDER: ActivityKind[] = [
  "design_created",
  "version",
  "run_failed",
  "order",
  "inquiry",
  "export",
  "share",
];

/** צבע הכרטיסייה לפי סוג. הכשל אדום — הוא מה שמחפשים כשפותחים את המסך. */
const KIND_COLOR: Record<ActivityKind, string> = {
  design_created: "bg-[#3f6297]/15 text-[#2c4a76]",
  version: "bg-blue-100 text-blue-700",
  run_failed: "bg-[#c0413b]/12 text-[#a8342f]",
  order: "bg-green-100 text-green-800",
  inquiry: "bg-amber-100 text-amber-800",
  export: "bg-stonesoft text-ink60",
  share: "bg-stonesoft text-ink60",
};

const VERSION_SOURCE: Record<"generate" | "edit" | "auto_repair", string> = {
  generate: s.adminUserEventVersionGenerate,
  edit: s.adminUserEventVersionEdit,
  auto_repair: s.adminUserEventVersionRepair,
};

const VERSION_STATUS: Record<"pass" | "warn" | "fail", string> = {
  pass: s.adminUserVersionPass,
  warn: s.adminUserVersionWarn,
  fail: s.adminUserVersionFail,
};

export default function UserDetail({
  id,
  onAuthLost,
}: {
  id: string;
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  const [filter, setFilter] = useState<ActivityKind | "">("");

  const { data, error, schemaOutdated, notFound, isLoading } = useAdminData<UserActivity>(
    `/api/admin/users/${id}`,
    { onAuthLost },
  );

  const events = useMemo(
    () => (filter ? (data?.events ?? []).filter((e) => e.kind === filter) : (data?.events ?? [])),
    [data, filter],
  );

  // אילו סוגים באמת קיימים אצלו. מסנן על סוג שאין ממנו כלום הוא כפתור שכל
  // תפקידו להחזיר רשימה ריקה.
  const present = useMemo(() => {
    const seen = new Set((data?.events ?? []).map((e) => e.kind));
    return KIND_ORDER.filter((k) => seen.has(k));
  }, [data]);

  const back = (
    <Link href="/admin/users" className="text-[13px] text-lapis hover:underline">
      {s.adminUserBack}
    </Link>
  );

  if (notFound) {
    return (
      <div dir="rtl">
        {back}
        <p className="mt-4 text-ink60">{s.adminUserNotFound}</p>
      </div>
    );
  }
  if (schemaOutdated) {
    return (
      <div dir="rtl">
        {back}
        <p className="mt-4 text-sm text-[#c0413b]">{s.adminUsersSchema}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div dir="rtl">
        {back}
        <p className="mt-4 text-sm text-[#c0413b]">{s.adminUserLoadError}</p>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div dir="rtl">
        {back}
        <p className="mt-4 text-ink60">{he.loading}</p>
      </div>
    );
  }

  const { user, counts } = data;

  return (
    <div dir="rtl">
      {back}

      <header className="mt-4 border-b border-graphite/10 pb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-graphite">
          <UserName user={user} />
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
          <UserEmail email={user.email} />
          {user.phone && (
            <span className="text-[13px] text-ink60">
              <bdi>{user.phone}</bdi>
            </span>
          )}
          <span className="text-[13px] text-mist">
            {s.adminUserColJoined}: {shortDate(user.created_at)}
          </span>
          <span className="text-[13px] text-mist">
            {s.adminUserColActive}: {shortDate(user.last_seen_at)} · {agoText(user.last_seen_at)}
          </span>
        </div>
      </header>

      <div className="mt-5 grid gap-2 sm:grid-cols-4">
        <Count label={s.adminUserCountDesigns} value={counts.designs} />
        <Count label={s.adminUserCountVersions} value={counts.versions} />
        <Count label={s.adminUserCountEdits} value={counts.edits} />
        <Count label={s.adminUserCountFailed} value={counts.failedRuns} alert={counts.failedRuns > 0} />
        <Count label={s.adminUserCountOrders} value={counts.orders} />
        <Count label={s.adminUserCountInquiries} value={counts.inquiries} />
        <Count label={s.adminUserCountExports} value={counts.exports} />
        <Count label={s.adminUserCountShares} value={counts.shares} />
      </div>

      {data.problems.length > 0 && (
        <p className="mt-4 text-[13px] text-[#c0413b]">
          {s.adminUserPartial} <span dir="ltr">{data.problems.join(", ")}</span>
        </p>
      )}
      {data.designsTruncated && (
        <p className="mt-2 text-[13px] text-mist">{s.adminUserDesignsTruncated}</p>
      )}

      <h2 className="mt-8 text-[15px] font-semibold text-graphite">{s.adminUserActivityTitle}</h2>

      {present.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={s.adminUserFilterKind}>
          {([["", s.adminFilterAll], ...present.map((k) => [k, KIND_LABEL[k]] as const)] as const).map(
            ([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => setFilter(value as ActivityKind | "")}
                aria-pressed={filter === value}
                className={`rounded-[2px] px-3 py-1.5 text-[13px] transition-colors ${
                  filter === value
                    ? "bg-graphite text-porcelain"
                    : "bg-porcelain text-ink60 hover:bg-stonesoft"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      )}

      {events.length === 0 ? (
        <p className="mt-4 text-ink60">{s.adminUserActivityEmpty}</p>
      ) : (
        <ul className="mt-4 border-t border-graphite/10">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-graphite/10 py-3">
              <span className="w-[130px] shrink-0 text-[12px] text-mist">{dateTime(e.at)}</span>
              <span className={`rounded-[2px] px-2 py-0.5 text-[12px] font-medium ${KIND_COLOR[e.kind]}`}>
                {KIND_LABEL[e.kind]}
              </span>
              <EventBody event={e} />
            </li>
          ))}
        </ul>
      )}

      {data.truncated && !filter && (
        <p className="mt-3 text-[13px] text-mist">{s.adminUserActivityTruncated}</p>
      )}
    </div>
  );
}

function Count({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="border border-graphite/10 bg-white p-3">
      <div
        className={`font-display text-[22px] leading-none ${alert ? "text-[#c0413b]" : "text-graphite"}`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-ink60">{label}</div>
    </div>
  );
}

/** מה שמופיע אחרי התווית: העיצוב שהאירוע נוגע בו, והפרט שמסביר אותו. */
function EventBody({ event }: { event: ActivityEvent }) {
  const design = event.design && (
    <span className="text-[13px] text-graphite">
      {event.design.code && (
        <span className="font-display font-bold tracking-[0.14em] text-lapis" dir="ltr">
          {event.design.code}
        </span>
      )}{" "}
      {event.design.name}
    </span>
  );

  return (
    <span className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
      {design}

      {event.version && (
        <span className="text-[13px] text-ink60">
          {s.adminUserEventVersion} {event.version.no} · {VERSION_SOURCE[event.version.source]} ·{" "}
          {VERSION_STATUS[event.version.status]}
        </span>
      )}

      {event.run && (
        <span className="text-[13px] text-ink60">
          {event.run.status === "rejected" ? s.adminUserEventRunRejected : s.adminUserEventRunError}
          {event.run.error && (
            <span className="text-mist"> · {truncate(event.run.error, 120)}</span>
          )}
        </span>
      )}

      {event.order && (
        <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink60">
          {event.order.ref && (
            <span className="font-display font-bold tracking-[0.14em] text-lapis" dir="ltr">
              {event.order.ref}
            </span>
          )}
          <span>{orderStatusLabel[event.order.status]}</span>
          {event.order.total != null && (
            <span>
              {he.design.ils}
              {event.order.total}
            </span>
          )}
          <Link href={`/admin/orders/${event.order.id}`} className="text-lapis hover:underline">
            {s.adminUserOpenOrder}
          </Link>
        </span>
      )}

      {event.inquiry && (
        <span className="text-[13px] text-ink60">
          {event.inquiry.kind === "order" ? s.adminKindOrder : s.adminKindContact} ·{" "}
          {truncate(event.inquiry.message, 160)}
        </span>
      )}

      {event.exported?.forced && (
        <span className="text-[13px] text-[#c0413b]">{s.adminUserEventExportForced}</span>
      )}

      {event.share && (
        <span className="text-[13px] text-ink60">
          {event.share.views} {s.adminUserEventShareViews}
          {event.share.revoked && ` · ${s.adminUserEventShareRevoked}`}
        </span>
      )}

      {!event.design && event.kind !== "inquiry" && (
        <span className="text-[13px] text-mist">{s.adminUserNoDesign}</span>
      )}
    </span>
  );
}

/** טקסט חופשי ביומן — קיצוץ ולא גלישה: שורת שגיאה שלמה דוחפת את הציר הצידה. */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
