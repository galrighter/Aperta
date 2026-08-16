"use client";

// "העיצובים שלי" — תוספת מעבר ל-handoff. מוצג מעל בחירת המוצר כשיש מה להמשיך.
// מקופל כברירת מחדל: הרשימה הפתוחה תפסה שליש מסך ודחפה את בחירת הצמיד/הטבעת
// מתחת לקיפול, כך שמסך הכניסה של המשפך היה "העיצובים שלי" ולא "מה בונים".
// עכשיו זו שורה אחת בולטת שנפתחת בלחיצה.
//
// הכרטיס עצמו חי ב-`SavedDesignCard` — הוא משותף לרשימה הזו ולדף `/designs`.
import { useEffect, useId, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { clampPage, pageCount, pageItems, SAVED_PAGE_SIZE } from "./savedPaging";
import { SavedDesignCard } from "./SavedDesignCard";
import type { SavedDesign } from "@/lib/client/myDesigns";

const d = he.design;

export function SavedDesigns({
  items, onResume, onRemove, onOpen, loadingId, error, notice = null, defaultOpen = false,
}: {
  items: SavedDesign[];
  onResume: (item: SavedDesign) => void;
  onRemove: (id: string) => void;
  /** העיצובים שמוצגים כרגע על המסך — הרשימה נפתחה, או שהתחלף עמוד. אלה
   *  שצריך להשלים להם ציור מהשרת, ורק הם: משיכה של רשימה שלמה מטלפון היא
   *  עשרות בקשות עבור כרטיסים שאיש עוד לא ראה. */
  onOpen?: (visibleIds: string[]) => void;
  loadingId: string | null;
  error: string | null;
  /** מה נאמר כשהרשימה ריקה ויש סיבה לומר משהו — נטענת, או שנכשלה. ראו
   *  `savedNotice`. */
  notice?: string | null;
  /** נכנסו דרך "העיצובים שלי" בכותרת — הרשימה נפתחת מעצמה. */
  defaultOpen?: boolean;
}) {
  /* מה שנלחץ כאן, ואם לא נלחץ — מה שהכתובת ביקשה.
     `useState(defaultOpen)` נקרא **פעם אחת**, ברינדור הראשון, והדגל שמגיע לכאן
     נדלק באפקט שקורא את הכתובת (`?designs=1`) — כלומר אחרי אותו רינדור. לכן
     הרשימה נשארה סגורה דווקא במסלול היחיד שביקש אותה פתוחה: מי שלחץ
     "העיצובים שלי" בכותרת נחת על מסך בחירת המוצר עם שורה מקופלת, וזה נראה
     בדיוק כמו לחיצה שלא עשתה כלום.

     נגזר ולא מסונכרן: `toggled` הוא מה שהלקוחה עשתה בשורה הזו, ו-`null` פירושו
     שלא נגעה בה. כך פתיחה מהכתובת מגיעה גם באיחור, וסגירה ידנית אחריה נשארת
     סגורה. */
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? defaultOpen;
  const [page, setPage] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  // ההסרה של עיצוב עשויה לרוקן את העמוד האחרון; העמוד המוצג נגזר ולא נשמר,
  // כדי שלא ייווצר מצב של "עמוד 4 מתוך 3".
  const pages = pageCount(items.length);
  const cur = clampPage(page, items.length);
  const shown = pageItems(items, cur);
  const from = cur * SAVED_PAGE_SIZE + 1;
  const to = cur * SAVED_PAGE_SIZE + shown.length;

  const visibleIds = shown.map((x) => x.id).join(",");
  useEffect(() => {
    if (open) onOpen?.(visibleIds ? visibleIds.split(",") : []);
  }, [open, visibleIds, onOpen]);

  const goTo = (p: number) => {
    setPage(clampPage(p, items.length));
    // הרשימה גוללת בתוך עצמה: בלי זה העמוד הבא נפתח באמצע.
    listRef.current?.scrollTo({ top: 0 });
  };

  // אין מה להמשיך — אבל אם ניסיון לפתוח עיצוב **נכשל**, ההסבר חייב להישאר על
  // המסך גם כאן. זה בדיוק המצב של קישור `?resume=` שנפתח בדפדפן שאין בו רשימה
  // מקומית (מייל, מכשיר אחר, חשבון אחר): הפתיחה נכשלת, המשפך נשאר במסך הראשון,
  // וההודעה היחידה שמסבירה למה נעלמה יחד עם הרשימה — כלומר לחיצה שנחתה בשקט על
  // "מה בונים" בזמן שהעיצוב שנלחץ קיים ומוכן.
  //
  // ומאותה סיבה בדיוק גם `notice`: רשימה שעדיין נמשכת מהחשבון, או משיכה
  // שנכשלה, נראות שתיהן כמו "אין לך עיצובים" — במסך ריק לגמרי.
  if (items.length === 0) {
    const line = error ?? notice;
    return line ? (
      <div
        className={`border border-graphite/10 border-s-2 border-s-lapis bg-chalk px-5 py-3.5 text-[13px] ${
          error ? "text-failred" : "text-ink60"
        }`}
        // "נטענת" מתחלף ברשימה עצמה, ולכן הוא חייב להיאמר גם למי שמקשיב.
        role={error ? undefined : "status"}
      >
        {line}
      </div>
    ) : null;
  }

  return (
    <div className="border border-graphite/10 bg-chalk">
      <button
        type="button"
        onClick={() => {
          setToggled(!open);
          setPage(0);
        }}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center gap-3 border-s-2 border-s-lapis px-5 py-3.5 text-start transition-colors hover:bg-porcelain"
      >
        <span className="font-display text-xs tracking-[0.15em] text-graphite">
          {d.savedTitle}
        </span>
        <span className="text-[13px] text-ink60">
          {items.length === 1 ? d.savedCountOne : `${items.length} ${d.savedCountMany}`}
        </span>
        <span className="ms-auto flex items-center gap-1.5 text-[13px] font-semibold text-lapis">
          {open ? d.savedHide : d.savedShow}
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {/* מחוץ לאזור המתקפל: שגיאת טעינה חייבת להישאר גלויה */}
      {error && <p className="border-t border-graphite/10 px-5 py-3 text-[13px] text-failred">{error}</p>}

      {open && (
        <div id={listId} className="border-t border-graphite/10 p-5">
          <p className="mb-4 text-sm text-ink60">{d.savedSubtitle}</p>

          <ul
            ref={listRef}
            className="grid max-h-[58vh] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3"
          >
            {shown.map((it) => (
              <SavedDesignCard
                key={it.id}
                it={it}
                onResume={onResume}
                onRemove={onRemove}
                loadingId={loadingId}
              />
            ))}
          </ul>

          {/* עימוד. הרשימה נפתחת מעל בחירת המוצר, ולכן היא לא יכולה להיות
              ארוכה כרצונה — אבל כל העיצובים נשמרים, ומכאן מגיעים לכולם. */}
          {pages > 1 && (
            <nav
              aria-label={d.savedPagerLabel}
              className="mt-4 flex items-center justify-between gap-3 border-t border-graphite/10 pt-3.5"
            >
              <button
                type="button"
                onClick={() => goTo(cur - 1)}
                disabled={cur === 0}
                className="text-[13px] font-semibold text-lapis underline-offset-4 hover:underline disabled:cursor-default disabled:text-mist disabled:no-underline"
              >
                {d.savedPrev}
              </button>
              <span className="text-[12px] text-ink60" aria-live="polite">
                {d.savedPageOf(cur + 1, pages)} · {d.savedRange(from, to, items.length)}
              </span>
              <button
                type="button"
                onClick={() => goTo(cur + 1)}
                disabled={cur >= pages - 1}
                className="text-[13px] font-semibold text-lapis underline-offset-4 hover:underline disabled:cursor-default disabled:text-mist disabled:no-underline"
              >
                {d.savedNext}
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
