"use client";

import { useEffect, useState } from "react";
import { he } from "@/i18n/he";

const d = he.design;

/**
 * מתי ההמתנה מפסיקה להיות טיפוסית ומתחילה להיראות תקועה.
 *
 * הרצה רגילה נגמרת ב-30–90 שניות. שתיים וחצי דקות הן מעבר לזנב שלה, ועדיין
 * הרבה לפני הגבולות שהצינור מרשה לעצמו (240ש׳ לרנדר, 300ש׳ לבקשה) — כלומר
 * נקודה שבה ההרצה עדיין בריאה לגמרי, אבל מי שיושב מולה כבר לא יודע את זה.
 */
export const SLOW_AFTER_MS = 150_000;

/** m:ss. השעון נקרא בסקירה מהירה, ולא נסרק כמספר. */
export function clockOf(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** איפה השעון יושב — מסך המתנה שלם, או פאנל בתוך מסך התוצאה. */
const TONE = {
  screen: {
    clock: "mb-4 font-mono text-[13px] tabular-nums text-mist",
    slow: "mb-8 max-w-[440px] text-[14px] leading-relaxed text-ink60",
  },
  inline: {
    clock: "mt-2.5 font-mono text-[12px] tabular-nums text-mist",
    slow: "mt-1.5 text-[13px] leading-relaxed text-ink60",
  },
} as const;

/**
 * כמה זמן ההמתנה הנוכחית רצה — ומתי היא חוצה את הטיפוסי.
 *
 * **רכיב נפרד, ובכוונה.** הספירה חייבת להתחיל מחדש בכל ניסיון, ולכן האיפוס
 * הוא ההרכבה עצמה: במסך העיבוד `error` מחליף את כל תת-העץ (מצב הכשל מחזיר
 * `section` אחר לגמרי), ובמסך התוצאה הרכיב חי בתוך `s.applying` ומתפרק בסופו
 * של כל שינוי. שעון שהיה חי אצל ההורה היה סופר את שני הניסיונות יחד, כלומר
 * משקר בדיוק על המספר שהוא קיים בשבילו.
 *
 * **משותף לשני המסלולים, ובכוונה.** יצירה ושינוי רצים באותו צינור עם אותם
 * הגבולות; שני שעונים נפרדים היו נפרדים גם ב-`SLOW_AFTER_MS` ברגע שמישהו יגע
 * באחד מהם.
 *
 * **המקום שבו הוא מורכב חייב להיות מחוץ ל-`aria-live`.** מספר שמתחלף כל
 * שנייה בתוך אזור חי הוא הקראה בלולאה, וזה ההפך ממה שהוא נועד לתת.
 */
export function ElapsedNotice({
  slow,
  tone = "screen",
}: {
  /**
   * מה ייאמר כשההמתנה חוצה את הטיפוסי — או `null` כשאין מה לומר (בניתוק,
   * למשל, הכותרת כבר אומרת את אותו הדבר). הטקסט שונה בין המסלולים: ביצירה
   * ראשונה יוצא מייל "העיצוב שלך מוכן", ובשינוי לא (`first: false`).
   */
  slow?: string | null;
  tone?: keyof typeof TONE;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const from = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - from), 1000);
    return () => clearInterval(t);
  }, []);

  const css = TONE[tone];

  return (
    <>
      {/* השעון. הוא כאן כדי שהמסך ייראה בדקה הרביעית אחרת מאשר בשנייה
          השלישית: בלעדיו אין על המסך הזה שום דבר שמבדיל בין "עובד" לבין "מת". */}
      <p className={css.clock}>{d.procElapsed(clockOf(elapsed))}</p>

      {/* חצינו את הטיפוסי. ההרצה עדיין באוויר — ולכן זו לא שגיאה אלא ידיעה,
          והיא **כן** נאמרת בקול: מי שאינו רואה את המסך צריך לשמוע שמותר לו
          ללכת. */}
      {slow && elapsed >= SLOW_AFTER_MS && (
        <p aria-live="polite" className={css.slow} style={{ textWrap: "pretty" }}>
          {slow}
        </p>
      )}
    </>
  );
}
