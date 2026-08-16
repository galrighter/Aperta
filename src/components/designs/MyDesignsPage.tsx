"use client";

// דף "העיצובים שלי" — העמוד העצמאי.
//
// עד עכשיו הרשימה חיה רק בתוך המשפך, כשורה מקופלת מעל בחירת המוצר
// (`SavedDesigns`) — מקום שנכון להמשך-מסע, אבל לא לניהול: אי אפשר היה למיין,
// והדרך אליה עברה דרך מסך שמזמין להתחיל עיצוב חדש. כאן הרשימה היא העמוד:
// אותם כרטיסים (`SavedDesignCard`), אותו אינדקס מקומי + סנכרון מהחשבון כמו
// במשפך, ומעליהם מיון.
//
// פתיחת עיצוב עוברת ל-`/design?resume=<id>` בטעינה מלאה — המשפך הוא שיודע
// לפתוח עיצוב (מסך הפתיחה, שחזור מצב, שגיאות), והדף הזה לא משכפל את זה.
import { useCallback, useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { api } from "@/lib/client/api";
import {
  listMyDesigns, mergeMyDesigns, removeMyDesign, setMyDesignPreview,
} from "@/lib/client/myDesigns";
import type { SavedDesign } from "@/lib/client/myDesigns";
import type { Account } from "@/lib/client/types";
import { circMmOfDesign } from "@/components/create/model";
import { savedNotice } from "@/components/create/savedNotice";
import { clampPage, pageCount, pageItems, SAVED_PAGE_SIZE } from "@/components/create/savedPaging";
import { SavedDesignCard } from "@/components/create/SavedDesignCard";
import { SIGN_IN_HREF } from "@/components/site/AccountMenu";
import { sortDesigns, type DesignsSortKey } from "./sortDesigns";

const s = he.site;
const d = he.design;

const SORTS: readonly { key: DesignsSortKey; label: string }[] = [
  { key: "updated", label: s.designsSortUpdated },
  { key: "serial", label: s.designsSortSerial },
  { key: "product", label: s.designsSortProduct },
];

export function MyDesignsPage() {
  const [saved, setSaved] = useState<SavedDesign[]>([]);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [sync, setSync] = useState<"idle" | "loading" | "failed">("idle");
  const [sort, setSort] = useState<DesignsSortKey>("updated");
  const [page, setPage] = useState(0);
  /** העיצוב שנלחץ — הכפתור מציג "פותח…" עד שהניווט המלא יוצא לדרך. */
  const [resumingId, setResumingId] = useState<string | null>(null);

  /* ===== האינדקס המקומי, ואז החשבון =====
     אותו סדר כמו במשפך: קודם מה שהמכשיר מכיר (מיידי), ואז השלמה מהשרת —
     שרצה בכל טעינה שיש בה חשבון, לא רק ברגע הכניסה.
     באפקט ולא באתחול ה-state: הרינדור הראשון חייב להיות זהה לשרת (שם אין
     localStorage), אחרת ההידרציה נכשלת על הרשימה. */
  // eslint-disable-next-line react-hooks/set-state-in-effect -- קריאה מ-localStorage, מערכת חיצונית שאין לה מנוי: היא חייבת לרוץ אחרי ההידרציה, ואותה שורה בדיוק חיה גם במשפך (design/page.tsx).
  useEffect(() => setSaved(listMyDesigns()), []);

  const syncFromAccount = useCallback(async () => {
    setSync("loading");
    try {
      const { designs } = await api.myDesigns();
      mergeMyDesigns(
        designs.map((dz) => ({
          id: dz.id,
          serial: dz.serial ?? undefined,
          name: dz.name,
          product: dz.product_type,
          // דרך מודל המידות, לא `length_mm + gap_mm` — ראו `sizeOfDesign`.
          circMm: Math.round(circMmOfDesign(dz)),
          widthMm: Number(dz.width_mm),
          cuts: 0,
          updatedAt: dz.updated_at,
          pending: dz.current_version_id ? undefined : true,
        })),
      );
      setSaved(listMyDesigns());
      setSync("idle");
    } catch {
      // במכשיר בלי אינדקס מקומי הסנכרון הוא המקור היחיד לרשימה, וכישלון שקט
      // שלו הוא מסך ריק שנראה כמו "אין לך עיצובים".
      setSync("failed");
    }
  }, []);

  useEffect(() => {
    api
      .account()
      .then(({ account: a }) => {
        setAccount(a);
        if (a) void syncFromAccount();
      })
      .catch(() => setAccount(null));
  }, [syncFromAccount]);

  /* ===== מיון ועימוד ===== */
  const sorted = sortDesigns(saved, sort);
  const pages = pageCount(sorted.length);
  const cur = clampPage(page, sorted.length);
  const shown = pageItems(sorted, cur);
  const from = cur * SAVED_PAGE_SIZE + 1;
  const to = cur * SAVED_PAGE_SIZE + shown.length;

  /* ===== השלמת ציורים לכרטיסים שנראים =====
     אותו כלל כמו במשפך: רק העמוד המוצג, בזה אחר זה, ופעם אחת לעיצוב —
     רשימה של חמישים עיצובים היא חמישים בקשות מטלפון, ורובן עבור עמוד
     שאיש לא פתח. */
  const previewTried = useRef<Set<string>>(new Set());
  const visibleIds = shown.map((x) => x.id).join(",");
  useEffect(() => {
    const wanted = new Set(visibleIds ? visibleIds.split(",") : []);
    const missing = saved.filter(
      (x) =>
        wanted.has(x.id) &&
        (!x.path || !x.results || !x.frameWidthMm) &&
        !x.pending &&
        !previewTried.current.has(x.id),
    );
    if (missing.length === 0) return;
    for (const item of missing) previewTried.current.add(item.id);

    let alive = true;
    void (async () => {
      for (const item of missing) {
        if (!alive) return;
        try {
          const { preview, results } = await api.designPreview(item.id);
          if (!preview) continue;
          setMyDesignPreview(
            item.id,
            preview,
            results?.map((r) => ({
              versionId: r.versionId,
              versionNo: r.versionNo,
              path: r.path,
              cuts: r.cuts,
              lengthMm: r.lengthMm,
              widthMm: r.widthMm,
            })),
          );
          if (!alive) return;
          setSaved(listMyDesigns());
        } catch {
          // כרטיס בלי ציור עדיין פותח את העיצוב. אין מה להציג על זה שגיאה.
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [visibleIds, saved]);

  const resume = useCallback((item: SavedDesign) => {
    setResumingId(item.id);
    // טעינה מלאה במכוון: המשפך פותח עיצוב מהכתובת (`?resume=`), על כל מסך
    // הפתיחה והשחזור שלו, וניווט פנימי לא היה מריץ את המסלול הזה.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ראו למעלה
    window.location.assign(`/design?resume=${encodeURIComponent(item.id)}`);
  }, []);

  const noticeKind = savedNotice({
    items: saved.length,
    account: !!account,
    syncing: sync === "loading",
    failed: sync === "failed",
    // הדף הזה **הוא** "העיצובים שלי" — מי שכאן ביקש את הרשימה במפורש.
    requested: true,
  });
  const noticeText =
    noticeKind === "failed" ? d.savedSyncFailed : noticeKind === "syncing" ? d.savedSyncing : null;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-10 sm:py-14">
      <h1 className="text-[32px] font-semibold leading-tight sm:text-[40px]" style={{ letterSpacing: "-1px" }}>
        {s.designsTitle}
      </h1>
      <p className="mt-2 max-w-[55ch] text-[15px] leading-relaxed text-ink80">{s.designsSubtitle}</p>

      {/* שורת המיון. כפתורי מצב ולא `<select>`: שלוש אפשרויות נראות במלואן,
          והנבחרת מסומנת בעין — אין מה להחביא מאחורי פתיחה. */}
      <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-graphite/10 py-3.5">
        <span className="font-display text-[11px] tracking-[0.15em] text-ink60">{s.designsSortLabel}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={s.designsSortLabel}>
          {SORTS.map((o) => {
            const on = sort === o.key;
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setSort(o.key);
                  setPage(0);
                }}
                className={`rounded-[2px] border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  on
                    ? "border-graphite bg-graphite text-porcelain"
                    : "border-graphite/20 text-ink80 hover:border-lapis hover:text-lapis"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {saved.length > 0 && (
          <span className="ms-auto text-[13px] text-ink60">
            {saved.length === 1 ? s.designsCountOne : `${saved.length} ${s.designsCountMany}`}
          </span>
        )}
      </div>

      {saved.length === 0 ? (
        <div className="mt-8 border border-graphite/10 border-s-2 border-s-lapis bg-chalk px-6 py-8">
          {noticeText ? (
            // הסנכרון באוויר או נכשל — מסך ריק בלי מילה נראה כמו מחיקה.
            <p className={`text-[14px] ${noticeKind === "failed" ? "text-failred" : "text-ink60"}`} role="status">
              {noticeText}
            </p>
          ) : (
            <>
              <p className="text-[15px] text-graphite">
                {account ? s.designsEmpty : s.designsSignedOut}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {!account && (
                  // `a` ולא `Link`: הכניסה נפתחת בתוך המשפך דרך מצב בכתובת
                  // (`?signin=1`) — ראו AccountMenu.
                  <a
                    href={SIGN_IN_HREF}
                    className="rounded-[2px] bg-graphite px-6 py-2.5 text-[14px] font-semibold text-porcelain transition-colors hover:bg-graphite/90"
                  >
                    {s.designsSignIn}
                  </a>
                )}
                <a
                  href="/design"
                  className={
                    account
                      ? "rounded-[2px] bg-graphite px-6 py-2.5 text-[14px] font-semibold text-porcelain transition-colors hover:bg-graphite/90"
                      : "text-[14px] font-semibold text-lapis underline-offset-4 hover:underline"
                  }
                >
                  {s.designsEmptyCta}
                </a>
                <a href="/story/create" className="text-[14px] text-lapis underline-offset-4 hover:underline">
                  {s.designsEmptyStory}
                </a>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((it) => (
              <SavedDesignCard
                key={it.id}
                it={it}
                onResume={resume}
                onRemove={(id) => {
                  removeMyDesign(id);
                  setSaved(listMyDesigns());
                }}
                loadingId={resumingId}
              />
            ))}
          </ul>

          {pages > 1 && (
            <nav
              aria-label={d.savedPagerLabel}
              className="mt-6 flex items-center justify-between gap-3 border-t border-graphite/10 pt-4"
            >
              <button
                type="button"
                onClick={() => setPage(clampPage(cur - 1, sorted.length))}
                disabled={cur === 0}
                className="text-[13px] font-semibold text-lapis underline-offset-4 hover:underline disabled:cursor-default disabled:text-mist disabled:no-underline"
              >
                {d.savedPrev}
              </button>
              <span className="text-[12px] text-ink60" aria-live="polite">
                {d.savedPageOf(cur + 1, pages)} · {d.savedRange(from, to, sorted.length)}
              </span>
              <button
                type="button"
                onClick={() => setPage(clampPage(cur + 1, sorted.length))}
                disabled={cur >= pages - 1}
                className="text-[13px] font-semibold text-lapis underline-offset-4 hover:underline disabled:cursor-default disabled:text-mist disabled:no-underline"
              >
                {d.savedNext}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
