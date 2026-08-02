"use client";

// "שיתוף" — מייצר לינק לדף `/d/<token>` ומוסר אותו.
//
// **המיקום הוא חצי מהפיצ'ר.** הגרסה הראשונה הייתה כרטיס מלא בעמודה הצדדית של
// מסך התוצאה, מתחת ליומן הגרסאות — מתוך מחשבה שלא יתחרה בכפתור ההזמנה. בטלפון
// העמודה הזו נערמת מתחת לכל השאר, כלומר הכפתור ישב אחרי התכשיט, ההצעות, תיבת
// בקשת השינוי, מצב הייצור והיומן. הוא היה שם ואי אפשר היה למצוא אותו. הרגע שבו
// רוצים לשתף הוא הרגע שבו מסתכלים על התכשיט, ולכן הוא יושב עכשיו לידו — בשורת
// מספר העיצוב, שנראית בלי גלילה בכל מסך.
//
// שלושה מסלולי מסירה, לפי מה שהדפדפן מרשה, ובסדר הזה:
//   1. `navigator.share` — גיליון השיתוף של המערכת. זה מה שרוצים בטלפון, ומשם
//      הלינק הולך לוואטסאפ בשתי נגיעות.
//   2. הלוח — בדסקטופ, שם אין גיליון שיתוף.
//   3. תיבה עם הלינק לבחירה ידנית.
//
// המסלול השלישי אינו תיאורטי: `navigator.share` ו-`clipboard.writeText` דורשים
// שניהם הרשאת משתמש פעילה, וזו פגה כשממתינים לתשובת רשת בין הלחיצה לקריאה.
// בלעדיו לחיצה על "שיתוף" באותם דפדפנים הייתה מייצרת לינק תקין בשרת ולא מראה
// אותו לאיש.
import { useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { api, ClientApiError } from "@/lib/client/api";
import { capturePreview } from "@/lib/client/previewCapture";
import { designCode } from "@/lib/designCode";

const t = he.share;

export function ShareButton({
  designId, versionId, serial, className = "", compact,
}: {
  designId: string;
  versionId: string;
  serial: number | null;
  /** סגנון הכפתור עצמו, כדי שיתלבש גם על כותרת הסטודיו וגם על מסך התוצאה. */
  className?: string;
  /** במסך צר נשאר האייקון בלבד. כותרת הסטודיו כבר צפופה בטלפון, ומילה
   *  נוספת שם דוחפת את "עיצוב חדש" מהמסך. */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // הפאנל נסגר בלחיצה בחוץ וב-Escape — ציפייה בסיסית מכל דבר שנפתח מעל התוכן.
  useEffect(() => {
    if (!url && !error) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [url, error]);

  function close() {
    setUrl(null);
    setError(null);
    setCopied(false);
  }

  async function onShare() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      // צילום ההדמיה שעל המסך, אם יש כזו. זו תמונת השיתוף — ראו
      // `lib/client/previewCapture`. null כשאין קנבס מוצג, ואז השרת נופל
      // להדמיה של מודל התמונה.
      const res = await api.createShare(designId, versionId, capturePreview());
      setUrl(res.url);

      const code = designCode(serial);
      if (navigator.share) {
        try {
          await navigator.share({
            title: code ? t.shareTitle(code) : he.site.brand,
            text: t.shareText,
            url: res.url,
          });
          // הגיליון נסגר אחרי שיתוף אמיתי — אין מה להשאיר פתוח מתחתיו.
          close();
          return;
        } catch (e) {
          // ביטול של המשתמש אינו כשל: הפאנל נשאר עם הלינק, וזו התשובה.
          if ((e as Error)?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(res.url);
        setCopied(true);
      } catch {
        /* נשארת התיבה עם הלינק */
      }
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : t.shareFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => void onShare()}
        disabled={busy}
        aria-label={t.shareBtn}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-[2px] border border-graphite/25 px-3 py-1.5 text-[13px] text-graphite transition-colors hover:border-cobalt hover:text-cobalt disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <ShareIcon />
        <span className={compact ? "hidden sm:inline" : undefined}>
          {busy ? t.shareBtnBusy : t.shareBtn}
        </span>
      </button>

      {(url || error) && (
        <div className="absolute top-[calc(100%+6px)] z-30 w-[min(320px,80vw)] border border-graphite/20 bg-white p-3 shadow-lg ltr:left-0 rtl:right-0">
          {url ? (
            <>
              <p className="mb-2 text-[12px] text-ink60">{copied ? t.shareCopied : t.shareHint}</p>
              <input
                readOnly
                value={url}
                dir="ltr"
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-[2px] border border-graphite/20 bg-porcelain px-2.5 py-1.5 text-[12px] text-graphite"
              />
            </>
          ) : (
            <p className="text-[13px]" style={{ color: "#c0413b" }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </svg>
  );
}
