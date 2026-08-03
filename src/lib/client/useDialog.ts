"use client";

import { useEffect, useRef } from "react";

/**
 * מה שהופך `role="dialog"` לדיאלוג באמת: מיקוד שנכנס פנימה, נשאר בפנים, וחוזר
 * למקום שממנו נפתח — ו-Escape שסוגר.
 *
 * למה זה לא קישוט. `aria-modal="true"` מבטיח לקורא-מסך שכל השאר לא רלוונטי,
 * אבל הוא לא מזיז את המיקוד ולא כולא אותו: בלי הקוד הזה Tab יוצא מהחלון אל
 * הטופס שמאחוריו, וקורא-מסך ממשיך להקריא עמוד שהמשתמשת כבר לא רואה. במקלדת
 * זה נראה כמו לחיצות שנעלמות.
 *
 * `onClose` נקרא ב-Escape. דיאלוג שאי אפשר לסגור במקלדת מחייב עכבר כדי לצאת
 * ממנו — וזה בדיוק מה שהיה בחלון "העיצוב מוכן".
 *
 * שימוש: `const ref = useDialog(open, onClose)` ואז `<div ref={ref} …>` על
 * **מכל התוכן** של הדיאלוג (לא על הרקע).
 */
export function useDialog(open: boolean, onClose?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const box = ref.current;
    // לאן להחזיר את המיקוד. בלי זה הסגירה מחזירה את המשתמשת לתחילת העמוד,
    // והמקום שממנו היא פתחה את החלון אבוד.
    const opener = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        box?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // המיקוד נכנס לשדה/כפתור הראשון. אם אין אף אחד — למכל עצמו, כדי שקורא-מסך
    // יקרא את הכותרת ולא ימשיך מהמקום שבו היה בעמוד.
    const first = focusable()[0];
    if (first) first.focus();
    else {
      box?.setAttribute("tabindex", "-1");
      box?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement;
      // גלגול בקצוות — זו הכליאה עצמה. גם המצב שבו המיקוד כבר בחוץ (לחיצה על
      // הרקע, למשל) מוחזר פנימה במקום להימשך אל העמוד.
      if (!e.shiftKey && (active === lastItem || !box?.contains(active))) {
        e.preventDefault();
        firstItem.focus();
      } else if (e.shiftKey && (active === firstItem || !box?.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open]);

  return ref;
}
