"use client";

// כרטיס עיצוב שמור אחד — חולץ מ-`SavedDesigns` כשדף `/designs` נולד: אותו
// כרטיס בדיוק משרת גם את הרשימה המקופלת שבמשפך וגם את הדף העצמאי, ושני
// עותקים שלו היו נשארים תואמים רק בזכות משמעת.
import { he } from "@/i18n/he";
import { designCode } from "@/lib/designCode";
import { LAPIS } from "./ui";
import { previewFrame } from "./savedPreview";
import type { SavedDesign } from "@/lib/client/myDesigns";

const d = he.design;

/** גבולות גובה לתיבת הציור. התיבה נגזרת מהיחס של הפריט עצמו — רצועה ארוכה
 *  מקבלת תיבה נמוכה ולא שדה לבן, ופריט מרובע יותר מקבל גובה אמיתי. */
const BOX_MIN_PX = 64;
const BOX_MAX_PX = 148;

export function SavedDesignCard({
  it, onResume, onRemove, loadingId,
}: {
  it: SavedDesign;
  onResume: (item: SavedDesign) => void;
  onRemove: (id: string) => void;
  loadingId: string | null;
}) {
  // הרוחב לציור הוא המסגרת שהגרסה יושבת בה; `widthMm` הוא מה
  // שהוזמן, וזה הכיתוב על הכרטיס. רשומה ישנה לא מכירה את ההבדל,
  // ולכן `previewFrame` מרחיב את המסגרת גם לפי הציור עצמו.
  const frameW = it.frameWidthMm ?? it.widthMm;
  const frame = it.path && it.lengthMm ? previewFrame(it.path, it.lengthMm, frameW) : null;
  return (
    // `min-w-0` הוא מה שמחזיק את הכרטיס בתוך העמודה. פריט ברשת
    // מקבל ברירת מחדל `min-width: auto` — כלומר "לא קטן ממה
    // שהתוכן דורש" — ותיבת הציור שבתוכו נושאת `aspect-ratio` יחד
    // עם `min-height`. הדפדפן מעביר את המינימום האנכי דרך היחס
    // ומקבל **מינימום אופקי**: רצועה ביחס 6.4 עם רצפה של 64px
    // דורשת 410px, ובעמודה של 345px הכרטיס פשוט רחב מהחלון.
    // הרשימה גוללת ב-`overflow-y-auto`, וגלילה אנכית הופכת גם את
    // האופקית ל-auto — ולכן זה לא נראה כשבירה אלא כעיצוב שיוצא
    // מהמסך וצריך לגרור אליו הצידה. נמדד בכרומיום: 411.6px לפני,
    // 345px אחרי. רצפת הגובה על התיבה עצמה אינה מספיקה כאן — היא
    // לא מסירה את התרומה של התוכן למינימום של הפריט.
    <li className="flex min-w-0 flex-col border border-graphite/[0.14] bg-porcelain">
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
                // הרוחב המפורש מחזיק את התיבה בתוך הכרטיס, אבל
                // המינימום שעובר דרך היחס עדיין מרחיב את הכרטיס
                // עצמו — ולכן `min-w-0` על ה-`li` שמעל.
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
}
