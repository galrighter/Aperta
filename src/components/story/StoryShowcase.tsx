"use client";

// story mode — הוויטרינה בדף הבית: סיפור → הדמיה → האפשרויות שחזרו.
//
// **מה החליף מה.** קודם ישבה כאן דוגמה בשני שדות: משפט, חץ, ואיור דקורטיבי
// (`PatternMark`). האיור הזה מעולם לא היה מוצר — הוא היה דוגמת ניקוב קבועה
// שצוירה "בהשראת" הפריט, זהה בכל ארבע הדוגמאות פרט לצורת החור. כלומר ההבטחה
// שבראש העמוד ("ספרי לנו, ואנחנו נתרגם") הודגמה בציור, ולא בתרגום.
//
// מה שיושב כאן עכשיו הוא המסלול עצמו, מקוצר לשלושה חלקים: **מה שסופר**
// (הפרומפט כלשונו), **מה שיצא מזה** (ההדמיה התלת-ממדית, אותה אחת של מסע
// היצירה), ו**מה עוד חזר** (שלוש האפשרויות, כמו במסך התוצאה). בחירה באפשרות
// אחרת מחליפה את ההדמיה — זו הפעולה שהמסך כולו מלמד, וכאן אפשר לעשות אותה
// לפני שנרשמים.
//
// **למה ההדמיה לפני האפשרויות, בניגוד למסך התוצאה.** שם הסדר נכון כי שם
// באמת בוחרים: ההצעות קודמות כי הן ההחלטה. כאן אין החלטה — יש טענה, ומי
// שנוחתת על דף הבית צריכה לראות קודם *מה יוצא מזה*. שלושת הפסים שמעל התכשיט
// דחו את התשובה בגלילה שלמה, ומי שלא גללה ראתה שלושה מלבנים כהים ולא תכשיט.
//
// **הנתונים אינם קופי.** כל אפשרות היא SVG קנוני של עיצוב, ב-
// `lib/story/showcase.ts`. ההדמיה בונה את הקשת מהגאומטריה שלו, ולא מתמונה.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { story } from "@/i18n/story";
import { SHOWCASE, showcaseCutouts, showcaseMaterial } from "@/lib/story/showcase";
import { ShowcaseStage } from "./ShowcaseStage";

/** כמה זמן כל סיפור על המסך. ארוך מקרוסלה רגילה: כאן צריך להספיק לקרוא משפט,
 *  להסתכל על שלוש אפשרויות ולראות את ההדמיה מסתובבת. */
const ROTATE_MS = 9000;

const s = story.home.showcase;

export function StoryShowcase({
  className = "",
  variant = "full",
}: {
  className?: string;
  /**
   * `compact` — הוויטרינה של דף הבית "שני שערים": סיפור ← הדמיה, בלי שורת
   * "מה שחזר". שם התפקיד הוא הוכחה ("מהמילים למתכת") ולא לימוד פעולת
   * הבחירה — זו נשארת ב-`/story`, המסך שמלמד אותה.
   */
  variant?: "full" | "compact";
}) {
  const [i, setI] = useState(0);
  /** האפשרות שההדמיה מציגה. `null` = זו שנבחרה בסיפור הזה. */
  const [pick, setPick] = useState<number | null>(null);
  /** הסיפור פרוש במלואו. נסגר בכל החלפת סיפור, אחרת הכרטיס היה מתחיל פתוח
   *  על משפט אחר — וגובהו היה משתנה בלי שנגעו בו. */
  const [open, setOpen] = useState(false);
  /** עצירה יזומה: מי שנגעה, בחרה — לא מושכים לה את המסך מתחת לאצבע. */
  const [held, setHeld] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    setI(((next % SHOWCASE.length) + SHOWCASE.length) % SHOWCASE.length);
    setPick(null);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (held) return;
    // מי שביקש פחות תנועה מקבל סיפור אחד קבוע ולא קרוסלה. זו העדפת מערכת,
    // ולא נגישות "בנוסף": החלפה אוטומטית היא בדיוק מה שהיא מבקשת לכבות.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setI((cur) => (cur + 1) % SHOWCASE.length);
      setPick(null);
      setOpen(false);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [held]);

  const ex = SHOWCASE[i];
  const sel = pick ?? ex.chosen;
  // הגאומטריה של ההדמיה. נגזרת מה-SVG של האפשרות המוצגת בלבד — החלפת אפשרות
  // מחליפה מודל בתוך אותה סצנה, ולא בונה סצנה חדשה.
  const material = useMemo(() => showcaseMaterial(ex, sel), [ex, sel]);

  /* התוויות הקטנות, לפי הרקע שהן נוחתות עליו. במצב המלא הצעיף נותן רקע אחיד
     ו-`mist` עובר; במצב compact הרקע שקוף והדקורציה של `ArchBackground` היא
     הרקע בפועל — אותה הכרעה של StoryHome: `mist` נופל מול קו הקצה של הלוח
     (3.85), `ink80` עובר (6.05). */
  const lab = variant === "compact" ? "text-ink80" : "text-mist";

  return (
    // אין כאן כרטיס. במצב המלא הצעיף (`ap-veil`) מחזיק את הניגודיות מול
    // הדקורציה בלי לצייר קצה; במצב compact אין גם צעיף — הרקע שקוף, כדי שלא
    // ייקרא כריבוע שמנת גדול באמצע דף הבית. את "כאן דוגמה" אומרת המסגרת
    // המוסטת שבעמוד המארח, וחוזה הניגודיות נשמר בטוקנים של הטקסט (ראו `lab`).
    <div
      className={`${variant === "full" ? "ap-veil " : ""}${className}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
    >
      {/* המרווחים והריפוד הודקו מעבר למידה של השאר. הסיבה מדידה: הוויטרינה
          נושאת ארבעה בלוקים (סיפור, חץ, שלוש אפשרויות, הדמיה), וכל 4px של
          מרווח מוכפלים פי חמישה. בערכים הקודמים העמודה יצאה 994px — כלומר
          ההדמיה, שהיא כל העניין, נחתכה בקו הקיפול בלפטופ נמוך.

          במצב compact הפריסה שונה: מ-sm ומעלה הסיפור וההדמיה עומדים זה לצד
          זה — הסיפור בעמודת הפתיחה (מימין בעברית) וההדמיה לצידו — והנקודות
          והרמז נפרשים מתחת לשניהם (`col-span-2`). בנייד נשאר הסדר האנכי. */}
      <div
        className={
          variant === "full"
            ? "flex flex-col gap-3.5 p-4 sm:gap-4 sm:p-6"
            : "grid gap-3.5 p-2 sm:grid-cols-[0.95fr_1.05fr] sm:items-center sm:gap-x-8 sm:gap-y-3 sm:p-5"
        }
      >
        {/* ===== מה שסופר ===== */}
        {/* ההחלקה יושבת על הבלוק הזה בלבד ולא על הכרטיס: על הקנבס של ההדמיה
            גרירה אופקית היא סיבוב, ומאזין החלקה מעליה היה הופך כל סיבוב
            להחלפת סיפור. */}
        <div
          // `min-w-0`: בעמודת גריד (compact) ה-`truncate` של המשפט אינו עובד
          // בלעדיו — העמודה מתרחבת לרוחב הטקסט במקום לחתוך אותו.
          className="min-w-0"
          onTouchStart={(e) => {
            setHeld(true);
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const from = touchX.current;
            touchX.current = null;
            const to = e.changedTouches[0]?.clientX;
            if (from === null || to === undefined || Math.abs(to - from) < 40) return;
            // RTL: החלקה שמאלה היא "הבא". הכיוון נגזר מכיוון הקריאה ולא מהציר.
            go(i + (to < from ? 1 : -1));
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className={`font-display text-[10px] tracking-[0.22em] ${lab}`}>
              {s.storyLabel} · {ex.kind}
            </div>
            <div className={`font-display text-[10px] tracking-[0.18em] ${lab}`}>
              {s.product[ex.product]}
            </div>
          </div>
          {/* **שורה אחת, ופתיחה בלחיצה.**
              קודם היה כאן גובה קבוע של שתיים-שלוש שורות, שנקבע לפי הסיפורים
              שיושבים כאן היום. זה לא יחזיק: פרומפט אמיתי יכול להיות פסקה, וכל
              שורה נוספת דוחפת את ההדמיה אל מתחת לקו הקיפול — הדבר היחיד שאסור
              שיקרה במסך הראשון. לכן השדה הוא שורה אחת תמיד, והעודף נחתך
              בשלוש נקודות.

              הטקסט **אינו מוסתר** — `text-overflow` הוא חיתוך ויזואלי בלבד,
              וקורא מסך מקריא את המשפט המלא בכל מצב. הכפתור נותן את אותה גישה
              בעין, ו-`aria-expanded` מדווח על המצב. גם כשהמשפט קצר ונכנס
              במלואו הכפתור קיים — כדי שלא יופיע וייעלם לפי אורך הסיפור. */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-2 block w-full cursor-pointer text-start text-[17px] leading-relaxed text-graphite sm:text-[19px]"
          >
            {/* `textWrap: "pretty"` רק במצב הפתוח, ובכוונה: `text-wrap` הוא
                קיצור שכולל את `text-wrap-mode`, ולכן `pretty` מאפס אותו
                ל-`wrap` וגובר על ה-`nowrap` של `truncate`. עם שניהם יחד
                השורה פשוט נשברה, והחיתוך לא קרה מעולם. */}
            <span
              className={open ? "block" : "block truncate"}
              style={open ? { textWrap: "pretty" } : undefined}
            >
              {`”${ex.story}“`}
            </span>
          </button>
        </div>

        {/* החץ — כלפי מטה, כי זה מה שקורה: הסיפור יורד לכדי צורה.
            בטלפון הוא לא מוצג: 28px (הוא ושני חצאי המרווח שלו) הם ההפרש בין
            תכשיט שנכנס למסך הראשון לתכשיט שנחתך, והוא דקורטיבי — התוויות
            "סיפור" ו"ההדמיה" אומרות את אותו הדבר במילים.
            במצב compact הוא לא מוצג בכלל: כשהסיפור וההדמיה זה לצד זה, חץ
            כלפי מטה מצביע לשום מקום. */}
        {variant === "full" && (
          <div aria-hidden="true" className="hidden items-center gap-3 sm:flex">
            <span className="h-px flex-1 bg-graphite/12" />
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-lapis" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M8 2v12M3.5 9.5 8 14l4.5-4.5" />
            </svg>
            <span className="h-px flex-1 bg-graphite/12" />
          </div>
        )}

        {/* ===== ההדמיה ===== */}
        {/* היא יושבת מעל האפשרויות, ולא אחריהן. הסדר הקודם היה נאמן למסך
            התוצאה — שם בוחרים ואז רואים — אבל כאן אין מה לבחור עדיין: מי
            שמגיעה לדף הבית צריכה קודם לראות **מה יוצא מזה**, ורק אחר כך את
            העובדה שהיו לזה כמה פרשנויות. התכשיט הוא הטענה; האפשרויות הן
            ההסבר. */}
        <div className="min-w-0">
          <div className={`font-display text-[10px] tracking-[0.22em] ${lab}`}>
            {s.renderLabel}
          </div>
          {/* בלי `key`, ובמכוון: הקרוסלה מחליפה סיפור כל תשע שניות, ומפתח
              שמשתנה היה מפרק ובונה WebGL context בכל החלפה — משאב שהדפדפן
              מגביל את מספרו, ושבנייתו היא הדבר היקר כאן. ההחלפה היא של המודל
              בתוך הסצנה: `Rolled3D` בונה גאומטריה חדשה ומסגר מחדש בכל שינוי
              של `material` והמידות. */}
          <ShowcaseStage
            material={material}
            cutouts={showcaseCutouts(ex.options[sel].svg)}
            lengthMm={ex.lengthMm}
            widthMm={ex.widthMm}
            gapMm={ex.gapMm}
            product={ex.product}
          />
          {/* ההדמיה עצמה שקופה לקורא מסך (קנבס); מה שנקרא הוא המשפט הזה. */}
          <span className="sr-only">{s.alt(ex.kind, ex.options[sel].note)}</span>
        </div>

        {/* ===== מה שחזר ===== */}
        {variant === "full" && (
        <div>
          <div className="font-display text-[10px] tracking-[0.22em] text-mist">
            {s.optionsLabel}
          </div>
          {/* אחת בשורה, ברוחב מלא — כמו במסך התוצאה. הפס הוא ביחס של כ-9:1,
              ובשלוש עמודות אי אפשר להשוות בין אפשרות לאפשרות. */}
          <div className="mt-2.5 flex flex-col gap-2">
            {ex.options.map((o, n) => {
              const on = n === sel;
              return (
                <button
                  key={o.note}
                  type="button"
                  onClick={() => {
                    setHeld(true);
                    setPick(n);
                  }}
                  aria-pressed={on}
                  aria-label={s.optionGoTo(n + 1, o.note)}
                  className={`bg-chalk px-2.5 pb-2 pt-1.5 text-start transition ${
                    on ? "border-2 border-graphite" : "border border-graphite/15 hover:border-graphite/40"
                  }`}
                >
                  {/* השורה קיימת בכל האפשרויות ומאוירת רק בנבחרת: אחרת בחירה
                      הייתה מגביהה כפתור אחד ומנמיכה אחר, וגובה הכרטיס כולו
                      היה משתנה בכל לחיצה. */}
                  <span
                    aria-hidden="true"
                    className={`block font-display text-[9px] leading-[1.4] tracking-[0.16em] ${
                      on ? "text-graphite" : "text-transparent"
                    }`}
                  >
                    {s.chosen}
                  </span>
                  {/* אותה קוטביות כמו בפריסה שבמסע היצירה: כהה הוא מתכת,
                      בהיר הוא מה שהוסר. */}
                  <svg
                    viewBox={`-1 -1 ${ex.lengthMm + 2} ${ex.widthMm + 2}`}
                    className="h-auto w-full"
                    aria-hidden="true"
                  >
                    <rect x="0" y="0" width={ex.lengthMm} height={ex.widthMm} fill="var(--color-graphite)" />
                    <g className="flat-cutouts" dangerouslySetInnerHTML={{ __html: showcaseCutouts(o.svg) }} />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* ניווט. נקודות ולא חצים: ארבעה סיפורים שווי ערך, לא רצף.
            ב-compact הוא נפרש מתחת לשתי העמודות — כיתוב לצמד, לא לעמודה. */}
        <div className={`flex items-center justify-center gap-2.5 ${variant === "compact" ? "sm:col-span-2" : ""}`}>
          {SHOWCASE.map((st, n) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                setHeld(true);
                go(n);
              }}
              aria-label={s.exampleGoTo(n + 1)}
              aria-current={n === i ? "true" : undefined}
              // שטח הנגיעה 32×32 גם כשהנקודה עצמה קטנה — הנקודה היא הסימן,
              // לא היעד.
              className="flex h-8 w-8 items-center justify-center"
            >
              <span
                className={`block h-1.5 w-1.5 rounded-full transition-colors ${
                  n === i ? "bg-lapis" : "bg-graphite/25"
                }`}
              />
            </button>
          ))}
        </div>

        <p
          className={`text-center font-display text-[11px] tracking-[0.14em] ${lab} ${
            variant === "compact" ? "sm:col-span-2" : ""
          }`}
        >
          {s.hint}
        </p>
      </div>
    </div>
  );
}
