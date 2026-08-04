"use client";

// פס ההתקדמות של ההמתנה למנוע. יושב כאן ולא בתוך מסך העיבוד כי אותה המתנה
// בדיוק קיימת גם בעריכה (ResultScreen), ושם עד עכשיו לא היה עליה שום סימן
// חוץ מכפתור שכתוב עליו "מחיל…".
import { useEffect, useState } from "react";

/**
 * כמה זמן לוקח לפס להגיע לתקרה.
 *
 * הקצב הקודם — צעד כל 240ms של `p + (96-p)*0.035 + 0.35` — מילא את הפס עד
 * התקרה בתוך ~16 שניות. הרצה אמיתית לוקחת כדקה עד שתיים, כלומר הפס עמד מלא
 * כמעט כל ההמתנה ולא אמר דבר מלבד "אני מזויף". המילוי נמתח לדקה וחצי: זה הרף
 * התחתון של הרצה אמיתית, כך שהפס מגיע לתקרה לכל המוקדם כשהתשובה כבר בדרך.
 */
export const FILL_MS = 90_000;

/** לא מגיעים ל-100%. הסיום האמיתי הוא כשהמנוע חוזר והמסך מתחלף. */
export const CEILING = 96;
const START = 4;

/**
 * מחושב מזמן שעבר ולא מנצבר צעד-אחר-צעד: לשונית ברקע חונקת setInterval, ומונה
 * צעדים היה נגרר מאחור בדיוק אצל מי שפתחה לשונית אחרת בזמן ההמתנה — הרוב.
 */
const TICK_MS = 250;

/**
 * המיקום של הפס אחרי `elapsedMs` של המתנה. האטה לקראת התקרה בלי לעצור בדרך,
 * ו-CEILING בדיוק ב-FILL_MS — לא לפני.
 */
export function progressAt(elapsedMs: number): number {
  const x = Math.min(Math.max(elapsedMs, 0) / FILL_MS, 1);
  return START + (CEILING - START) * (1 - (1 - x) * (1 - x));
}

export function ProgressBar({
  active,
  label,
  className = "",
}: {
  /** האם ההמתנה רצה עכשיו. מעבר ל-true מאפס את הפס. */
  active: boolean;
  label?: string;
  className?: string;
}) {
  const [progress, setProgress] = useState(START);

  useEffect(() => {
    if (!active) {
      setProgress(START);
      return;
    }
    const t0 = Date.now();
    setProgress(START);
    const t = setInterval(() => {
      const elapsed = Date.now() - t0;
      setProgress(progressAt(elapsed));
      if (elapsed >= FILL_MS) clearInterval(t);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className={`h-[3px] w-full overflow-hidden bg-graphite/12 ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-lapis transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
