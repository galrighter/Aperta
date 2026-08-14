"use client";

// "העיצובים שלי" — תוספת מעבר ל-handoff. מוצג מעל בחירת המוצר כשיש מה להמשיך.
// מקופל כברירת מחדל: הרשימה הפתוחה תפסה שליש מסך ודחפה את בחירת הצמיד/הטבעת
// מתחת לקיפול, כך שמסך הכניסה של המשפך היה "העיצובים שלי" ולא "מה בונים".
// עכשיו זו שורה אחת בולטת שנפתחת בלחיצה.
import { useEffect, useId, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { designCode } from "@/lib/designCode";
import { LAPIS } from "./ui";
import { clampPage, pageCount, pageItems, SAVED_PAGE_SIZE } from "./savedPaging";
import { previewFrame } from "./savedPreview";
import type { SavedDesign } from "@/lib/client/myDesigns";

const d = he.design;

/** גבולות גובה לתיבת הציור. התיבה נגזרת מהיחס של הפריט עצמו — רצועה ארוכה
 *  מקבלת תיבה נמוכה ולא שדה לבן, ופריט מרובע יותר מקבל גובה אמיתי. */
const BOX_MIN_PX = 64;
const BOX_MAX_PX = 148;

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
            {shown.map((it) => {
              // הרוחב לציור הוא המסגרת שהגרסה יושבת בה; `widthMm` הוא מה
              // שהוזמן, וזה הכיתוב על הכרטיס. רשומה ישנה לא מכירה את ההבדל,
              // ולכן `previewFrame` מרחיב את המסגרת גם לפי הציור עצמו.
              const frameW = it.frameWidthMm ?? it.widthMm;
              const frame = it.path && it.lengthMm ? previewFrame(it.path, it.lengthMm, frameW) : null;
              return (
                <li key={it.id} className="flex flex-col border border-graphite/[0.14] bg-porcelain">
                  {/* תצוגה מקדימה מהגאומטריה השמורה. הציור נכנס בשלמותו: התיבה
                      מקבלת את היחס של הפריט, וה-SVG ממלא אותה ב-meet — כלומר
                      נכנס לגמרי, ממורכז, בלי חיתוך ובלי מתיחה. */}
                  <div
                    className="flex items-center justify-center overflow-hidden border-b border-graphite/10 bg-chalk px-3 py-2.5"
                    style={
                      frame
                        ? {
                            // רוחב מפורש, ולא רק יחס: כשגובה התיבה נתקל
                            // ב-`minHeight`, הדפדפן גוזר מהיחס את **הרוחב**
                            // והתיבה יוצאת מהכרטיס לרוחב. נמדד בכרומיום.
                            width: "100%",
                            aspectRatio: `${frame.ratio}`,
                            minHeight: `${BOX_MIN_PX}px`,
                            maxHeight: `${BOX_MAX_PX}px`,
                          }
                        : { minHeight: `${BOX_MIN_PX}px` }
                    }
                  >
                    {frame && it.path && it.lengthMm ? (
                      <svg
                        viewBox={frame.viewBox}
                        preserveAspectRatio="xMidYMid meet"
                        className="h-full w-full"
                        role="img"
                        aria-label={it.name}
                      >
                        <rect
                          x="0" y="0" width={it.lengthMm} height={frameW}
                          fill="none" stroke="rgba(32,35,38,0.3)" strokeWidth={Math.max(0.2, frameW / 90)}
                        />
                        <path
                          d={it.path} fillRule="evenodd" fill="none"
                          stroke={LAPIS} strokeWidth={Math.max(0.2, frameW / 110)}
                        />
                      </svg>
                    ) : (
                      <span className="font-mono text-[11px] text-mist">
                        {it.pending ? d.savedPending : d.savedNoPreview}
                      </span>
                    )}
                  </div>

                  {/* כל מה שהעיצוב הזה ייצר, ולא רק הגרסה שמוצגת גדול.
                      שלוש יצירות על אותו פריט הן שלוש גרסאות שלו — פריט אחד,
                      מספר סידורי אחד — אבל בלי השורה הזאת מי שיצר שלוש פעמים
                      ראה כרטיס אחד ולא שום שביל לשתיים האחרות. */}
                  {it.results && it.results.length > 1 && it.lengthMm && (
                    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-graphite/10 bg-chalk px-3 py-2">
                      {it.results.map((r) => {
                        // לכל גרסה המסגרת שלה. הן נבדלות זו מזו ברוחב, ולכן ציור
                        // של אחת בתוך המסגרת של האחרת חתך אותה.
                        const rw = r.widthMm ?? frameW;
                        const rl = r.lengthMm ?? it.lengthMm!;
                        const rf = previewFrame(r.path, rl, rw);
                        return (
                          <span
                            key={r.versionId}
                            className="flex h-6 w-16 flex-none items-center justify-center"
                          >
                            <svg
                              viewBox={rf.viewBox}
                              preserveAspectRatio="xMidYMid meet"
                              className="h-full w-full"
                              role="img"
                              aria-label={`${d.savedResultNo} ${r.versionNo}`}
                            >
                              <rect
                                x="0" y="0" width={rl} height={rw}
                                fill="none" stroke="rgba(32,35,38,0.25)" strokeWidth={Math.max(0.2, rw / 90)}
                              />
                              <path
                                d={r.path} fillRule="evenodd" fill="none"
                                stroke={LAPIS} strokeWidth={Math.max(0.3, rw / 70)}
                              />
                            </svg>
                          </span>
                        );
                      })}
                      <span className="flex-none ps-1 text-[11px] text-mist">
                        {it.results.length} {d.savedResults}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-3.5">
                    {/* המספר הסידורי קודם לשם: הוא מה שאומרים כשמדברים על העיצוב */}
                    {designCode(it.serial) && (
                      <div className="mb-1 font-display text-[11px] tracking-[0.14em] text-lapis" dir="ltr">
                        {designCode(it.serial)}
                      </div>
                    )}
                    <div className="text-sm font-semibold text-graphite">
                      {it.product === "ring" ? he.ring : he.bracelet} · {it.circMm} {d.mm}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink60">
                      {it.widthMm} {d.mm}
                      {it.pending ? ` · ${d.savedPending}` : ` · ${it.cuts} ${d.savedCuts}`}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onResume(it)}
                        disabled={loadingId === it.id}
                        className="text-[13px] font-semibold text-lapis underline-offset-4 hover:underline disabled:opacity-60"
                      >
                        {loadingId === it.id ? d.savedLoading : it.pending ? d.savedFinish : d.savedResume}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(d.savedRemoveConfirm)) onRemove(it.id);
                        }}
                        className="text-[12px] text-mist hover:text-ink60"
                      >
                        {d.savedRemove}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
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
