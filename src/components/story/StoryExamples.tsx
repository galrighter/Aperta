"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PatternMark, { type PatternVariant } from "@/components/site/PatternMark";
import { story } from "@/i18n/story";

// story mode — הדוגמה החיה בדף הבית החלופי: סיפור ↓ תרגום.
//
// **מה היא אמורה להעביר, ומה לא.** לא "איך ה-AI פירש את המשפט" ולא הסבר על
// התהליך — אלא דבר אחד: משהו שאני מספרת יכול להפוך לצורה. לכן שני שדות בלבד,
// חץ ביניהם, וארבע דוגמאות שמתחלפות: עיצוב, זיכרון, חוויה, רגש. ארבע ולא אחת,
// כי הרוחב הזה הוא המסר — "סיפור" כאן אינו חייב להיות עמוק או רגשי.
//
// **הצורות הן `PatternMark` הקיים** ולא מערכת תמונות חדשה: זהו האיור שכבר חי
// בגלריה ובשפת המותג. אחת מכל וריאנט לכל דוגמה, קבוע — לא אקראי, כדי ש-SSR
// והידרציה יסכימו.
const VARIANTS: PatternVariant[] = ["diamonds", "waves", "stripes", "drops"];

/** כמה זמן כל דוגמה על המסך. מספיק כדי לקרוא משפט בעברית ולא להרגיש ממהר. */
const ROTATE_MS = 5200;

const s = story.home;

export function StoryExamples({ className = "" }: { className?: string }) {
  const [i, setI] = useState(0);
  /** עצירה יזומה: מי שנגעה, בחרה — לא מושכים לה את המסך מתחת לאצבע. */
  const [held, setHeld] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    setI(((next % s.examples.length) + s.examples.length) % s.examples.length);
  }, []);

  useEffect(() => {
    if (held) return;
    // מי שביקש פחות תנועה מקבל דוגמה אחת קבועה ולא קרוסלה. זו העדפת מערכת,
    // ולא נגישות "בנוסף": החלפה אוטומטית היא בדיוק מה שהיא מבקשת לכבות.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((cur) => (cur + 1) % s.examples.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [held]);

  const ex = s.examples[i];

  return (
    // אין כאן כרטיס. עד עכשיו זו הייתה תיבה ממולאת עם מסגרת, וב-`/story` היא
    // נקראה כריבוע שהשתלט על הרקע — בנייד היא תפסה כמעט את כל הרוחב. מה שהחזיק
    // את הדוגמה כיחידה אינו המילוי אלא המבנה שכבר קיים: התוויות, החץ בין שני
    // החלקים והמסגרת המוסטת שסביבה. הצעיף (`ap-veil`) מחליף את המילוי — הוא
    // שומר על הניגודיות בלי לצייר קצה.
    <div
      className={`ap-veil ${className}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
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
      <div className="flex flex-col gap-4 p-5 sm:gap-5 sm:p-7">
        {/* הסיפור */}
        <div>
          <div className="font-display text-[10px] tracking-[0.22em] text-mist">
            {s.examplesLabel} · {ex.kind}
          </div>
          {/* גובה קבוע לשני שדות הטקסט: בלי זה כל החלפה מזיזה את הכרטיס,
              ובמובייל גם את ה-CTA שמתחתיו. */}
          <p
            className="mt-2 min-h-[3.5em] text-[17px] leading-relaxed text-graphite sm:min-h-[2.6em] sm:text-[19px]"
            style={{ textWrap: "pretty" }}
          >
            {`”${ex.text}“`}
          </p>
        </div>

        {/* החץ — כלפי מטה, כי זה מה שקורה: הסיפור יורד לכדי צורה */}
        <div aria-hidden="true" className="flex items-center gap-3">
          <span className="h-px flex-1 bg-graphite/12" />
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-lapis" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M8 2v12M3.5 9.5 8 14l4.5-4.5" />
          </svg>
          <span className="h-px flex-1 bg-graphite/12" />
        </div>

        {/* התרגום */}
        <div>
          <div className="font-display text-[10px] tracking-[0.22em] text-mist">
            {s.examplesTranslation}
          </div>
          {/* הצורה עומדת על הדף עצמו. הריבוע הממולא שהיה כאן היה פורצלן על
              פורצלן — כלומר מלבן שלא נראה, שכל תפקידו בפועל היה להוסיף עוד קצה. */}
          <div className="mt-3 flex items-center justify-center px-2 py-4 sm:py-6">
            <PatternMark variant={VARIANTS[i]} className="h-auto w-full max-w-[320px]" />
          </div>
          {/* הצורה עצמה `aria-hidden`; מה שנקרא בקורא מסך הוא המשפט הזה. */}
          <span className="sr-only">{s.exampleAlt(ex.kind)}</span>
        </div>

        {/* ניווט. נקודות ולא חצים: ארבע דוגמאות שוות ערך, לא רצף. */}
        <div className="flex items-center justify-center gap-2.5 pt-1">
          {s.examples.map((_, n) => (
            <button
              key={n}
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

        {/* הכיתוב עבר לכאן מ-`StoryHome`. שם הוא היה אח של הבלוק ולא חלק ממנו,
            כלומר `text-mist` ב-11px שנצבע ישירות מעל הדקורציה — בדיוק המצב
            ש-§B1 תיאר. כאן הוא בתוך הצעיף, והמסגרת המוסטת עוטפת את הדוגמה
            והכיתוב כיחידה אחת במקום לחתוך ביניהם. */}
        <p className="text-center font-display text-[11px] tracking-[0.14em] text-mist">
          {s.examplesHint}
        </p>
      </div>
    </div>
  );
}
