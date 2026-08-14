"use client";

// handoff §5 — מסך עיבוד. הפרוגרס אמיתי-למראה אך ההמתנה היא לתשובת המנוע
// (לא טיימר, כנדרש ב-§5). מצב הכשל נוסף כאן — §11.2 מסמן אותו כחסר.
import { useEffect, useMemo, useState } from "react";
import { he } from "@/i18n/he";
import { ElapsedNotice } from "./ElapsedNotice";
import { RECURRING_FAILURES } from "./model";
import { ProgressBar } from "./ProgressBar";
import { GhostBtn, PrimaryBtn } from "./ui";

const d = he.design;
const QUOTE_MS = 7000;

/** ערבוב Fisher-Yates — סדר אקראי בלי חזרות עד שהרשימה מוצתה. */
function shuffled<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * כשלים שניסיון חוזר רק חוזר עליהם.
 *
 * `content_blocked` — מסנן התוכן דחה את התיאור, ואותו תיאור יידחה גם בפעם
 * הבאה. ב-AP-0077 (3.8.26) זה קרה ארבע פעמים ברציפות מול "עיטורי מיקי מאוס",
 * וכפתור "נסה שוב" היה הפעולה הראשית בכל אחת מהן.
 * `bad_size` — המידה נדחתה, והמקום לתקן אותה הוא מסך המידות.
 * `text_too_long` — הכיתוב לא נכנס לפריט, וזה נכון גם בהרצה הבאה.
 * `rate_limited` — המכסה היומית; מחר, לא עכשיו.
 * `quota_exhausted` — התקציב אצל ספק התמונות נגמר. זה כשל **אצלנו**, שאף
 * לחיצה של הלקוחה לא מקרבת את פתרונו: ההודעה עצמה אומרת "נסו שוב מאוחר
 * יותר", ועד עכשיו היא הוצגה ליד כפתור "נסה שוב" שהזמין בדיוק את ההפך —
 * לנסות עכשיו, לתוך אותו קיר, שוב ושוב.
 *
 * מה שאינו כאן הוא ברירת המחדל: כשל רנדר, ניתוק, דחיית ווקטורייזר — כולם
 * מקריים, ושם ניסיון חוזר הוא בדיוק הפעולה הנכונה.
 */
const RETRY_POINTLESS = new Set([
  "content_blocked",
  "bad_size",
  "text_too_long",
  "rate_limited",
  "quota_exhausted",
]);

export function ProcessingScreen({
  error, detail, code, failCount = 0, accountEmail, onFeedback, disconnected, locked, onRetry, onBack,
}: {
  error: string | null;
  /** מזהה טכני קצר (קוד + סטטוס) — כדי שצילום מסך יהיה ראיה. */
  detail?: string | null;
  /** קוד הכשל — קובע אם "נסה שוב" הוא בכלל פעולה. */
  code?: string | null;
  /** כמה יצירות נכשלו ברצף. משניים המסך אומר שהתקלה חוזרת ומציע משוב. */
  failCount?: number;
  /** לאן יישלח מייל האישור על המשוב — נאמר מראש, לא מתגלה בדיעבד. */
  accountEmail?: string | null;
  /** שליחת המשוב. `mailed` — האם מייל האישור באמת יצא. */
  onFeedback?: (message: string) => Promise<{ mailed: boolean }>;
  /**
   * החיבור לבקשה נקטע וההרצה ממשיכה בשרת — הלקוחה מחכה לשורה, לא לבקשה.
   *
   * זהו מצב שלישי בין ספינר לשגיאה, והוא נוסף כי לא היה כזה: ניתוק הוצג
   * כ"היצירה נכשלה" (AP-0090). ההמתנה נמשכת עד להכרעה של השרת, ולכן היא
   * יכולה להתארך — ומסך שמסתובב בשקט דקות ארוכות הוא בדיוק מה שנראה שבור.
   */
  disconnected?: boolean;
  /**
   * ההרצה באוויר, ולכן המסע נעול — Back וסרגל השלבים אינם זזים מכאן.
   *
   * נאמר על המסך ולא רק נאכף מאחוריו: ההמתנה נמשכת דקות — כמה, אומר השעון
   * ולא הבטחה קבועה — היד הולכת ללחצן האחורה מעצמה, ומסך שחוסם בלי להסביר
   * נראה תקוע. הסיבה עצמה גם היא לא סוד — חזרה אחורה באמצע הייתה מייצרת
   * עיצוב שני על אותו תיאור.
   */
  locked?: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  // סדר אקראי נקבע פעם אחת לכל כניסה למסך; המסך נטען רק אחרי פעולת
  // המשתמשת, ולכן אין כאן חשש ל-hydration mismatch.
  const order = useMemo(() => shuffled(d.procQuotes), []);
  const [qi, setQi] = useState(0);
  const [fade, setFade] = useState(true);

  // טופס המשוב של מצב "תקלה חוזרת". חי כאן ולא במצב המשפך: הוא של המסך הזה
  // בלבד, והמסך נשאר על כנו לאורך ניסיונות חוזרים — "נשלח" לא נמחק בכשל הבא.
  const [fbText, setFbText] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  /** `mailed` — נשלח ומייל האישור יצא; `saved` — נשמר אצלנו בלי מייל. */
  const [fbDone, setFbDone] = useState<null | "mailed" | "saved">(null);
  const [fbFailed, setFbFailed] = useState(false);

  const sendFeedback = async () => {
    if (!onFeedback || fbBusy || fbDone) return;
    setFbBusy(true);
    setFbFailed(false);
    try {
      const { mailed } = await onFeedback(fbText);
      setFbDone(mailed && accountEmail ? "mailed" : "saved");
    } catch {
      setFbFailed(true);
    }
    setFbBusy(false);
  };

  // החלפת ציטוטים כל 7 שניות עם fade
  useEffect(() => {
    if (error) return;
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setQi((i) => (i + 1) % order.length);
        setFade(true);
      }, 320);
    }, QUOTE_MS);
    return () => clearInterval(t);
  }, [error, order.length]);

  if (error) {
    // תקלה חוזרת: המשתמש כבר לחץ "נסו שוב" וזה לא עבד. הכותרת מפסיקה לומר
    // "נכשלה" ומתחילה לומר "אנחנו בודקים" — והמסך מציע לספר לנו, במקום להזמין
    // לחיצה שלישית לתוך אותו קיר. כשלים שניסיון חוזר ממילא חסר בהם טעם
    // (RETRY_POINTLESS) לא נכנסים לכאן — יש להם הסבר ופעולה משלהם.
    const recurring =
      failCount >= RECURRING_FAILURES && !RETRY_POINTLESS.has(code ?? "") && Boolean(onFeedback);
    return (
      <section className="mx-auto flex max-w-[620px] flex-col items-center px-5 py-24 text-center sm:px-10">
        <div
          className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border-2 border-graphite/25 font-display text-2xl text-graphite"
          aria-hidden="true"
        >
          !
        </div>
        <h1 className="mb-3 text-[26px] font-semibold tracking-tight text-graphite sm:text-[32px]">
          {recurring ? d.procRepeatedTitle : d.procErrorTitle}
        </h1>
        <p className="mb-3 text-[17px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {recurring ? d.procRepeatedBody : d.procErrorBody}
        </p>
        {/* הודעת השגיאה עצמה — ink80 ולא mist: זה הטקסט שמסביר למה נכשל,
            והוא צריך להיות הקריא ביותר במסך, לא החיוור ביותר. */}
        <p
          role="alert"
          className="mx-auto mb-9 max-w-md border-s-2 border-lapis bg-chalk px-4 py-3 text-start font-mono text-[13px] leading-relaxed text-ink80"
        >
          {error}
          {/* מזהה טכני — בלי זה כשל אצל הלקוחה מגיע אלינו כ"משהו השתבש"
              ואי אפשר להבדיל בין דחיית ווקטורייזר, תשובה קטועה, וקריסת שרת. */}
          {detail && <span className="mt-1.5 block text-[11px] text-mist">{detail}</span>}
        </p>

        {/* משוב מתוך הודעת השגיאה — רק בתקלה חוזרת. `aria-live` על אזור
            הסטטוס: מי שאינו רואה את המסך צריך לשמוע ש"נשלח" קרה. */}
        {recurring && (
          <div className="mb-9 w-full max-w-md border border-graphite/15 bg-chalk px-5 py-5 text-start">
            {fbDone ? (
              <p aria-live="polite" className="text-[14px] leading-relaxed text-graphite">
                {fbDone === "mailed" && accountEmail
                  ? d.procFeedbackSent(accountEmail)
                  : d.procFeedbackSentNoMail}
              </p>
            ) : (
              <>
                <div className="mb-2 text-[14px] font-semibold text-graphite">
                  {d.procFeedbackTitle}
                </div>
                <textarea
                  value={fbText}
                  onChange={(e) => setFbText(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  aria-label={d.procFeedbackLabel}
                  placeholder={d.procFeedbackLabel}
                  className="mb-3 w-full resize-y border border-graphite/25 bg-chalk px-3 py-2 text-[14px] leading-relaxed text-graphite outline-none focus:border-lapis"
                />
                {accountEmail && (
                  <p className="mb-3 text-[12px] leading-relaxed text-ink60">
                    {d.procFeedbackNote(accountEmail)}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <PrimaryBtn onClick={() => void sendFeedback()} disabled={fbBusy}>
                    {fbBusy ? d.procFeedbackBusy : d.procFeedbackSend}
                  </PrimaryBtn>
                  {fbFailed && (
                    <p aria-live="polite" className="text-[12px]" style={{ color: "var(--color-failred)" }}>
                      {d.procFeedbackFailed}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* כשניסיון חוזר חסר טעם, החזרה לתיאור היא הפעולה — ולא אפשרות משנית
            לצד כפתור שמזמין לחזור על אותו כשל. */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {RETRY_POINTLESS.has(code ?? "") ? (
            <PrimaryBtn onClick={onBack}>{d.procBack}</PrimaryBtn>
          ) : recurring ? (
            // הניסיון החוזר כבר נכשל — הוא נשאר זמין, אבל מפסיק להיות ההצעה.
            <>
              <GhostBtn onClick={onRetry}>{d.procRetry}</GhostBtn>
              <GhostBtn onClick={onBack}>{d.procBack}</GhostBtn>
            </>
          ) : (
            <>
              <PrimaryBtn onClick={onRetry}>{d.procRetry}</PrimaryBtn>
              <GhostBtn onClick={onBack}>{d.procBack}</GhostBtn>
            </>
          )}
          {/* סירוב של מסנן התוכן הוא הכשל היחיד שיש עליו מה לקרוא: ההודעה
              אומרת משפט אחד, והדף מרכז את כל הקטגוריות ואת מה לכתוב במקום.
              נפתח בלשונית חדשה — המשפך נשאר פתוח מאחוריו, על התיאור שנחסם. */}
          {code === "content_blocked" && (
            <a
              href="/design-rules"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[2px] border border-graphite/25 px-[30px] py-3 text-base font-medium text-graphite transition-colors hover:bg-porcelain"
            >
              {he.errContentBlockedRules}
            </a>
          )}
        </div>
      </section>
    );
  }

  const q = order[qi];

  return (
    <section className="mx-auto flex max-w-[620px] flex-col items-center px-5 py-24 text-center sm:px-10">
      {/* `aria-live` על הכותרת והגוף בלבד, ובמכוון לא על הציטוט המתחלף למטה:
          ההמתנה נמשכת דקות, ומי שאינו רואה את המסך צריך לדעת שני דברים —
          שהיצירה רצה, וש"אבד החיבור" קרה. ציטוט שמתחלף כל שבע שניות בתוך
          אזור חי היה מקריא ספרות מעל שורת המצב שוב ושוב. */}
      <div aria-live="polite">
        <h1 className="mb-4 text-[26px] font-semibold tracking-tight text-graphite sm:text-[32px]">
          {disconnected ? d.procDisconnected : d.procTitle}
        </h1>
        <p className="mb-10 text-[16px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {disconnected ? d.procDisconnectedBody : d.procBody}
        </p>
      </div>

      {/* פס התקדמות. הוא נשאר פעיל גם בניתוק — ההרצה באמת ממשיכה, ומסך קפוא
          היה אומר את ההפך מהכותרת שמעליו. */}
      <ProgressBar
        active
        label={disconnected ? d.procDisconnected : d.procTitle}
        className="mb-4"
      />

      {/* בניתוק אין מה להוסיף כשההמתנה מתארכת — הכותרת כבר אומרת את אותו
          הדבר, והשעון עצמו נשאר. */}
      <ElapsedNotice slow={disconnected ? null : d.procSlow} />

      {/* הנעילה נאמרת, ולא רק נאכפת. מחוץ ל-`aria-live` שלמעלה: זו עובדה
          קבועה של המסך ולא עדכון, ואין סיבה להקריא אותה שוב בכל שינוי מצב. */}
      {locked && (
        <p className="mb-12 max-w-[440px] border border-graphite/15 bg-chalk px-4 py-3 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {d.procLockNote}
        </p>
      )}

      {/* ציטוט מתחלף */}
      <blockquote
        className="mt-6 transition-opacity duration-300"
        style={{ opacity: fade ? 1 : 0 }}
      >
        <p className="text-[19px] leading-relaxed text-graphite" style={{ textWrap: "balance" }}>
          {q.text}
        </p>
        <footer className="mt-3 font-display text-xs tracking-[0.2em] text-mist">{q.by}</footer>
      </blockquote>
    </section>
  );
}
