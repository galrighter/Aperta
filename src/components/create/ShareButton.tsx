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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { he } from "@/i18n/he";
import { api, ClientApiError } from "@/lib/client/api";
import { capturePreview } from "@/lib/client/previewCapture";
import { composeShareImage, type FlatSource } from "@/lib/client/shareImage";
import { designCode } from "@/lib/designCode";

const t = he.share;

/** היכולת אינה משתנה לאורך חיי העמוד, ולכן אין למה להירשם. מוגדר ברמת המודול
 *  כדי שהזהות תישאר יציבה — הרשמה חדשה בכל רנדר הייתה מבטלת את הנקודה. */
const subscribeNever = () => () => {};
const hasNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export function ShareButton({
  designId, versionId, serial, code: codeOverride, flat, className = "", compact,
}: {
  designId: string;
  versionId: string;
  serial: number | null;
  /** המספר להצגה כשהוא אינו נגזרת פשוטה של serial — גרסת-עריכה יושבת על
   *  דוגמה ממוספרת (`AP-0085.2`), והשיתוף צריך למסור את המספר שלה. */
  code?: string | null;
  /** הפריסה של הגרסה המוצגת — נכנסת לתמונת השיתוף מתחת להדמיה. */
  flat?: FlatSource | null;
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
  /**
   * האם יש גיליון שיתוף מערכתי. נקרא אחרי ההרכבה ולא בזמן הרנדר: `navigator`
   * אינו קיים בשרת, והשוואה בין השניים הייתה מייצרת אי-התאמת hydration.
   *
   * `useSyncExternalStore` ולא `useState`+`useEffect`: שניהם פותרים את
   * ה-hydration, אבל השני עושה זאת דרך רנדר שני בכל טעינה — לקבוע ערך שהיה
   * ידוע כבר בצביעה הראשונה בדפדפן. כאן `getServerSnapshot` מחזיר `false`
   * (בשרת אין `navigator`, ולכן גם אין גיליון שיתוף), והדפדפן קורא את האמת
   * שלו מיד. ההרשמה ריקה כי היכולת אינה משתנה לאורך חיי העמוד.
   */
  const canNativeShare = useSyncExternalStore(subscribeNever, hasNativeShare, () => false);

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

  /**
   * הלחיצה הראשונה מכינה את הלינק ופותחת את הפאנל. היא **אינה** מנסה לפתוח
   * את גיליון השיתוף בעצמה, וזה תיקון:
   *
   * `navigator.share` ו-`clipboard.writeText` דורשים הרשאת משתמש פעילה, וזו
   * פגה תוך שניות ספורות. מרגע שהצילום נכנס לתמונה הבקשה נושאת JPEG ולוקחת
   * מספיק זמן כדי שההרשאה תפוג לפני שהיא חוזרת — ואז הגיליון נזרק
   * ב-`NotAllowedError` והקוד נפל להעתקה שקטה. זה בדיוק מה שנמדד: "לחיצה על
   * שיתוף רק מעתיקה קישור, לפני זה נפתח מסך שיתוף" (גל, 2.8).
   *
   * לכן הפעולות יושבות בפאנל, וכל אחת מהן היא לחיצה משלה — עם הרשאה טרייה,
   * בלי המתנה לרשת ביניהן.
   */
  async function onPrepare() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      // תמונת השיתוף: צילום ההדמיה שעל המסך (ראו `lib/client/previewCapture`)
      // והפריסה מתחתיו, בתמונה אחת. בלי קנבס מוצג נשארת הפריסה לבדה, ובלי
      // שתיהן נשלח null — ואז השרת נופל להדמיה של מודל התמונה.
      const image = await composeShareImage(capturePreview(), flat ?? null);
      const res = await api.createShare(designId, versionId, image);
      setUrl(res.url);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : t.shareFailed);
    } finally {
      setBusy(false);
    }
  }

  /** הטקסט שנוסע עם הלינק — בוואטסאפ ובגיליון המערכת כאחד. */
  function messageFor(link: string): string {
    const code = codeOverride ?? designCode(serial);
    return `${t.shareText}${code ? ` (${code})` : ""}\n${link}`;
  }

  async function onNativeShare(link: string) {
    const code = codeOverride ?? designCode(serial);
    try {
      await navigator.share({
        title: code ? t.shareTitle(code) : he.site.brand,
        text: t.shareText,
        url: link,
      });
      close();
    } catch (e) {
      // ביטול של המשתמש אינו כשל — הפאנל נשאר פתוח עם שאר האפשרויות.
      if ((e as Error)?.name !== "AbortError") setError(t.shareFailed);
    }
  }

  async function onCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // דפדפן שלא נותן לכתוב ללוח: התיבה למטה נבחרת אוטומטית, וזו הדרך.
      setCopied(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => (url ? close() : void onPrepare())}
        disabled={busy}
        aria-expanded={Boolean(url)}
        aria-label={t.shareBtn}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-[2px] border border-graphite/25 px-3 py-1.5 text-[13px] text-graphite transition-colors hover:border-lapis hover:text-lapis disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="mb-2.5 text-[12px] text-ink60">{t.shareHint}</p>

              {/* וואטסאפ ראשון ובולט: זה הערוץ שבו הלינקים באמת נוסעים כאן.
                  `wa.me` עובד בכל דפדפן ופותח את האפליקציה בטלפון — בלי תלות
                  ב-`navigator.share`, שאינו קיים בדסקטופ ונחסם כשההרשאה פגה. */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(messageFor(url))}`}
                target="_blank"
                rel="noopener noreferrer"
                // בלי `onClick` שסוגר את הפאנל: הסרת העוגן באותו tick של
                // הלחיצה עלולה לבטל את הניווט עצמו, וזה הכפתור הראשי כאן.
                // הפאנל נסגר בלחיצה בחוץ, ב-Escape, או בלחיצה חוזרת.
                className="flex w-full items-center justify-center gap-2 rounded-[2px] px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "#25D366" }}
              >
                <WhatsAppIcon />
                {t.shareWhatsApp}
              </a>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void onCopy(url)}
                  className="flex-1 rounded-[2px] border border-graphite/25 px-3 py-2 text-[13px] text-graphite transition-colors hover:border-lapis hover:text-lapis"
                >
                  {copied ? t.shareCopied : t.shareCopy}
                </button>
                {/* גיליון המערכת — רק איפה שהוא קיים. נלחץ בנפרד, ולכן הוא
                    מקבל הרשאת משתמש טרייה ולא נזרק כמו קודם. */}
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={() => void onNativeShare(url)}
                    className="flex-1 rounded-[2px] border border-graphite/25 px-3 py-2 text-[13px] text-graphite transition-colors hover:border-lapis hover:text-lapis"
                  >
                    {t.shareMore}
                  </button>
                )}
              </div>

              <input
                readOnly
                value={url}
                dir="ltr"
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full rounded-[2px] border border-graphite/20 bg-porcelain px-2.5 py-1.5 text-[12px] text-graphite"
              />
            </>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--color-failred)" }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.18h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.4c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.24-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42-.14 0-.3-.02-.47-.02-.16 0-.43.06-.66.31-.22.24-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
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
