"use client";

// "העיצוב שלך מוכן" — למי שיצאה מהמסך בזמן היצירה.
//
// הבאג שזה סוגר, כפי שנמדד במסע אמיתי: לחצו "שלח", יצאו מהמסך, והצמיד נוצר.
// הוא נשמר בשרת עם כל הגרסאות שלו — ובכל זאת לא הגיע שום חיווי, לא באתר ולא
// במייל, ולא הייתה דרך לראות מה יצא. התוצאה חוזרת ל-state של מסך אחד; מי
// שעזבה אותו איבדה אותה.
//
// הרכיב יושב ב-layout של האתר כדי שהחיווי יגיע גם למי שגלשה לעמוד אחר. הוא
// שואל על ההרצה **רק** כשאף מסך לא מחכה לה (פעימת הלב ב-`pendingJob`
// התיישנה), כך שמי שנשארה במסך העיבוד לא מקבלת חלון על מה שהיא רואה ממילא.
import { useCallback, useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { api, ClientApiError } from "@/lib/client/api";
import {
  clearPendingJob, isUnwatched, readPendingJob, type PendingJob,
} from "@/lib/client/pendingJob";
import { markMyDesignDone } from "@/lib/client/myDesigns";
import { useDialog } from "@/lib/client/useDialog";

const d = he.design;

/** כל כמה זמן לבדוק. היצירה לוקחת ~30-90 שניות; זה קרוב מספיק ורחוק מהצפה. */
const POLL_MS = 6000;

type Outcome = { kind: "ready"; job: PendingJob } | { kind: "failed"; job: PendingJob };

export default function DesignReadyWatch() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const dismiss = useCallback(() => setOutcome(null), []);
  // Escape, כליאת מיקוד, והחזרת המיקוד למקום שממנו החלון קפץ. הוא נפתח מעצמו
  // על עמוד שהמשתמשת באמצע, ולכן דווקא כאן חייבת להיות דרך לצאת ממנו במקלדת.
  const box = useDialog(Boolean(outcome), dismiss);

  const check = useCallback(async () => {
    const job = readPendingJob();
    if (!job) return;
    // מסך פעיל מחכה לתשובה — הוא זה שיציג אותה.
    if (!isUnwatched(job)) return;

    try {
      const state = await api.job(job.jobId);
      if (state.status === "done") {
        clearPendingJob();
        // הרשומה המקומית מסומנת כמושלמת מיד, אחרת "העיצובים שלי" ממשיך להראות
        // "טרם הושלם" על עיצוב שכן הושלם.
        markMyDesignDone(job.designId);
        // עריכה של עיצוב קיים אינה "העיצוב שלך מוכן" — היא שינוי שכבר נשמר.
        if (job.first) setOutcome({ kind: "ready", job });
        return;
      }
      if (state.status === "error") {
        clearPendingJob();
        setOutcome({ kind: "failed", job });
      }
    } catch (e) {
      // 404 = אין שורה כזו (חלון בין פריסה למיגרציה, או ניקוי): אין על מה
      // לחכות. כל השאר הוא כשל משיכה חולף, וננסה בפעימה הבאה.
      if (e instanceof ClientApiError && e.status === 404) clearPendingJob();
    }
  }, []);

  useEffect(() => {
    // גם במשפך עצמו: מי שחזרה אליו אחרי שיצאה באמצע היצירה צריכה את החיווי
    // בדיוק כמו מי שגלשה לעמוד אחר. מה ששומר על השקט כשהמסך כן מחכה הוא
    // פעימת הלב, ולא הכתובת.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- מנוי לסקר חיצוני — המקרה שהכלל עצמו מתיר — אבל הקריאה עוברת דרך פונקציה שכותבת state.
    void check();
    const t = setInterval(() => void check(), POLL_MS);
    // חזרה ללשונית היא הרגע הסביר ביותר לגלות שהעיצוב מוכן — בלי לחכות לפעימה.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const ready = outcome?.kind === "ready";

  return !outcome ? null : (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ready ? d.readyTitle : d.readyFailedTitle}
      // סגירה בלחיצה על הרקע. עד כאן לא הייתה שום דרך לסגור חוץ משני
      // הכפתורים, והחלון קופץ מעצמו על עמוד שהמשתמשת באמצע.
      onClick={dismiss}
    >
      <div
        ref={box}
        className="w-full max-w-[420px] border border-graphite/15 bg-white p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-[22px] font-semibold tracking-tight text-graphite">
          {ready ? d.readyTitle : d.readyFailedTitle}
        </h2>
        <p className="mb-6 text-[15px] leading-relaxed text-ink60">
          {ready ? d.readyBody : d.readyFailedBody}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setOutcome(null);
              // אותה כתובת בשני המצבים: המשפך פותח את העיצוב אם יש לו גרסה,
              // ומחזיר לטופס עם מה שהוזן אם היצירה נעצרה.
              //
              // טעינה מלאה ולא ניווט פנימי: הפרמטר נקרא בעליית המסך, וניווט
              // מ-/design אל /design?resume=… לא מרנדר אותו מחדש.
              window.location.assign(`/design?resume=${outcome.job.designId}`);
            }}
            className="rounded-[2px] bg-graphite px-6 py-3 text-[15px] font-semibold text-porcelain transition-colors hover:bg-graphite/90"
          >
            {ready ? d.readyOpen : d.readyFailedRetry}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-[13px] text-ink60 underline-offset-4 hover:underline"
          >
            {d.readyLater}
          </button>
        </div>
      </div>
    </div>
  );
}
