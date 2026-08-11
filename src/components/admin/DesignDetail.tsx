"use client";

// עיצוב אחד בבק־אופיס: מה נוצר בפועל, איזו גרסה נבחרה, של מי הוא, ומאיפה
// מורידים ממנו קבצי ייצור.
//
// **למה המסך הזה קיים.** מיומן היצירות היה קישור אחד אל העיצוב, והוא הצביע על
// המשפך של הלקוחה (`/design?resume=<id>`). המסלול ההוא נשען על בעלות: הוא
// נפתח רק אצל מי שהעיצוב רשום עליו. לאדמין שפתח עיצוב של לקוחה, הקריאה חזרה
// 403, המשפך נשאר במצב ההתחלתי — ולכן הלחיצה נחתה על מסך בחירת המוצר, בלי
// שום הסבר, בזמן שהעיצוב עצמו מוכן ושמור. כאן הקריאה עוברת דרך שער האדמין
// (`/api/admin/designs/[id]`), כמו הייצוא שלצידו, ולכן היא עובדת על עיצוב של
// כל אחד.
//
// **קריאה בלבד.** אין כאן עריכה, יצירה מחדש או הזמנה: פעולות כאלה על העיצוב
// של לקוחה שייכות למשפך שלה, ובק־אופיס שמסוגל להן הוא בק־אופיס שאפשר לשנות
// ממנו בטעות את מה שהיא כבר אישרה.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAdminData } from "@/lib/client/useAdminData";
import { he } from "@/i18n/he";
import { designSampleCode } from "@/lib/designCode";
import type { AdminDesignDetail, AdminVersionRow } from "@/lib/db/accounts";
import ExportFiles from "./ExportFiles";
import { svgThumbnailSrc } from "./svgThumbnail";
import { dateTime, shortDate } from "./userView";

const s = he.site;

const SOURCE_LABEL: Record<AdminVersionRow["source"], string> = {
  generate: s.adminUserEventVersionGenerate,
  edit: s.adminUserEventVersionEdit,
  auto_repair: s.adminUserEventVersionRepair,
};

const STATUS_LABEL: Record<AdminVersionRow["validation_status"], string> = {
  pass: s.adminUserVersionPass,
  warn: s.adminUserVersionWarn,
  fail: s.adminUserVersionFail,
};

const STATUS_COLOR: Record<AdminVersionRow["validation_status"], string> = {
  pass: "bg-green-100 text-green-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-[#c0413b]/12 text-[#a8342f]",
};

export default function DesignDetail({
  id,
  onAuthLost,
}: {
  id: string;
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  /** איזו גרסה מוצגת גדולה. `null` = מה שברירת המחדל בוחרת (הנבחרת/האחרונה):
   *  הבחירה כאן נשמרת רק כשהיא של האדמין, ולכן היא לא נדרסת בכל רענון SWR. */
  const [pickedId, setPickedId] = useState<string | null>(null);

  const { data, error, schemaOutdated, notFound, isLoading } = useAdminData<AdminDesignDetail>(
    `/api/admin/designs/${id}`,
    { onAuthLost },
  );

  // הגרסה שהלקוחה בחרה היא `current_version_id`, והיא לא בהכרח האחרונה שנוצרה:
  // אחרי חזרה לגרסה קודמת, "האחרונה" היא בדיוק זו שנדחתה. לכן היא ברירת המחדל
  // כאן — וגם מה שהייצוא לוקח בלי `versionId` מפורש.
  const shown = useMemo(() => {
    const versions = data?.versions ?? [];
    if (versions.length === 0) return null;
    const byPick = pickedId ? versions.find((v) => v.id === pickedId) : undefined;
    const current = data?.design.current_version_id
      ? versions.find((v) => v.id === data.design.current_version_id)
      : undefined;
    return byPick ?? current ?? versions[0];
  }, [data, pickedId]);

  const back = (
    <Link href="/admin/designs" className="text-[13px] text-lapis hover:underline">
      {s.adminDesignBack}
    </Link>
  );

  if (notFound) {
    return (
      <div dir="rtl">
        {back}
        <p className="mt-4 text-ink60">{s.adminDesignNotFound}</p>
      </div>
    );
  }
  if (schemaOutdated) {
    return (
      <div dir="rtl">
        {back}
        <p className="mt-4 text-sm text-[#c0413b]">{s.adminDesignsSchema}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div dir="rtl">
        {back}
        <p className="mt-4 text-sm text-[#c0413b]">{s.adminDesignError}</p>
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

  const { design, versions, truncated } = data;
  const code = designSampleCode(design);

  return (
    <div dir="rtl">
      {back}

      <header className="mt-4 border-b border-graphite/10 pb-5">
        <h1 className="flex flex-wrap items-baseline gap-3 text-[22px] font-semibold tracking-tight text-graphite">
          {code && (
            <span className="font-display font-bold tracking-[0.14em] text-lapis" dir="ltr">
              {code}
            </span>
          )}
          <span>{design.name}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink60">
          <span>
            {design.product_type === "ring" ? he.ring : he.bracelet} ·{" "}
            {Math.round(design.length_mm + design.gap_mm)} × {design.width_mm} {he.design.mm}
          </span>
          <span>
            {s.adminDesignThickness} {design.thickness_mm} {he.design.mm}
          </span>
          <span className="text-mist">
            {s.adminDesignCreated}: {shortDate(design.created_at)}
          </span>
          <span className="text-mist">
            {s.adminDesignUpdated}: {shortDate(design.updated_at)}
          </span>
        </div>
      </header>

      {design.owner ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border border-graphite/10 bg-white p-3">
          <span className="text-[12px] text-mist">{s.adminDesignOwnerTitle}</span>
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: design.owner.color }}
          />
          <span className="text-sm font-semibold text-graphite">{design.owner.name}</span>
          {design.owner.kind === "tester" && (
            <span className="bg-stonesoft px-1.5 py-0.5 text-[11px] text-ink60">
              {s.adminTesterBadge}
            </span>
          )}
          {design.owner.email && (
            <a href={`mailto:${design.owner.email}`} className="text-[13px] text-ink60 hover:underline">
              <bdi>{design.owner.email}</bdi>
            </a>
          )}
          {design.owner.phone && (
            <span className="text-[13px] text-ink60">
              <bdi>{design.owner.phone}</bdi>
            </span>
          )}
          <Link
            href={`/admin/users/${design.owner.id}`}
            className="text-[13px] text-lapis hover:underline"
          >
            {s.adminDesignOpenUser}
          </Link>
        </div>
      ) : (
        <p className="mt-5 text-[13px] text-mist">{s.adminNoOwner}</p>
      )}

      {/* אין גרסה = היצירה נפתחה ולא הושלמה. זו התשובה שהמסך הזה חייב לתת
          במפורש: קודם הלחיצה על העיצוב הובילה למשפך, ומשפך ריק נראה כמו תקלה
          בניווט ולא כמו עיצוב שאין בו כלום. */}
      {!shown ? (
        <p className="mt-6 border border-graphite/15 bg-white px-5 py-4 text-[13px] text-ink60">
          {s.adminDesignNoVersions}
        </p>
      ) : (
        <div className="mt-6 border border-graphite/20 bg-white">
          <div className="flex min-h-[320px] items-center justify-center overflow-hidden border-b border-graphite/10 p-5">
            {/* כתמונה ולא הזרקה ל-DOM — ראו `svgThumbnail`: ה-SVG נבנה מפרומפט
                של משתמש. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={svgThumbnailSrc(shown.svg)}
              alt={design.name}
              className="max-h-[60vh] max-w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <span className="text-sm font-semibold text-graphite">
              {s.adminUserEventVersion} {shown.version_no}
            </span>
            <span className="text-[13px] text-ink60">{SOURCE_LABEL[shown.source]}</span>
            <span
              className={`rounded-[2px] px-2 py-0.5 text-[12px] ${STATUS_COLOR[shown.validation_status]}`}
            >
              {STATUS_LABEL[shown.validation_status]}
            </span>
            <span className="text-[12px] text-mist">{dateTime(shown.created_at)}</span>
            {shown.id === design.current_version_id && (
              <span className="bg-stonesoft px-1.5 py-0.5 text-[11px] text-ink60">
                {s.adminDesignCurrentBadge}
              </span>
            )}
          </div>
          {shown.user_prompt && (
            <p className="border-t border-graphite/10 px-4 py-3 text-[13px] text-ink60">
              <span className="text-mist">{s.adminDesignVersionPrompt}: </span>
              {shown.user_prompt}
            </p>
          )}
          {/* הגרסה **המוצגת** ולא "הנוכחית": מה שרואים על המסך הוא מה שיירד. */}
          <ExportFiles
            designId={design.id}
            versionId={shown.id}
            className="border-t border-graphite/10 px-4 py-3"
          />
        </div>
      )}

      {versions.length > 1 && (
        <>
          <h2 className="mt-8 text-[15px] font-semibold text-graphite">
            {s.adminDesignVersionsTitle}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {versions.map((v) => {
              const active = v.id === shown?.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setPickedId(v.id)}
                    aria-pressed={active}
                    className={`flex w-full flex-col border bg-white text-right transition-colors ${
                      active ? "border-graphite" : "border-graphite/20 hover:border-graphite/50"
                    }`}
                  >
                    <span className="flex h-[110px] items-center justify-center overflow-hidden border-b border-graphite/10 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={svgThumbnailSrc(v.svg)}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3">
                      <span className="text-[13px] font-semibold text-graphite">
                        {s.adminUserEventVersion} {v.version_no}
                      </span>
                      <span className="text-[12px] text-ink60">{SOURCE_LABEL[v.source]}</span>
                      <span
                        className={`rounded-[2px] px-1.5 text-[11px] ${STATUS_COLOR[v.validation_status]}`}
                      >
                        {STATUS_LABEL[v.validation_status]}
                      </span>
                      {v.id === design.current_version_id && (
                        <span className="bg-stonesoft px-1.5 text-[11px] text-ink60">
                          {s.adminDesignCurrentBadge}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {truncated && <p className="mt-3 text-[13px] text-mist">{s.adminDesignVersionsTruncated}</p>}
        </>
      )}
    </div>
  );
}
