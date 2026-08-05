"use client";

// שער הזיהוי. נפתח ברגע שבו מבקשים מהמנוע ליצור — ולא בכניסה לעמוד.
//
// למה שם: המסכים שלפניו (בחירת מוצר, מידות, תיאור) הם ההתנסות שמשכנעת, וטופס
// לפניהם מגרש מבקר שעוד לא יודע מה הוא מקבל. הרגע שאחריהם הוא גם הרגע היקר —
// כל יצירה היא הרצת מנוע — וגם הרגע שבו נוצרת רשומה שצריכה בעלים.
//
// הזיהוי עצמו הוא Supabase Auth: חשבון גוגל, או קוד חד־פעמי במייל. אין סיסמה,
// ובכוונה — סיסמה היא עוד דבר לאבד, ועוד דבר לאבטח.
import { useCallback, useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { useDialog } from "@/lib/client/useDialog";
import { TextInput } from "./ui";
import { supabaseBrowser, authConfigured } from "@/lib/client/supabaseBrowser";

const d = he.design;

type Step = "choose" | "code";

export function AccountGate({
  open,
  onCancel,
  onSignedIn,
  /** מה לשמור לפני יציאה לגוגל — העמוד ייטען מחדש בדרך חזרה. */
  onBeforeRedirect,
  /** שגיאה שנולדה מחוץ לשער — למשל חזרה כושלת מגוגל. */
  externalError,
  /**
   * עבודה שרצה מחוץ לשער ועדיין קשורה אליו — משיכת החשבון אחרי שהזהות אומתה.
   *
   * במסלול הקוד היא נעשית בתוך `verify`, שמחזיק את הטופס עסוק לכל אורכה.
   * בחזרה מגוגל אין `verify`: העמוד נטען מחדש, קורא ל-`onSignedIn` בעצמו,
   * והדיאלוג עמד פתוח עם כפתורים חיים בזמן שהוא עובד.
   */
  externalBusy,
}: {
  open: boolean;
  onCancel: () => void;
  /** נקרא אחרי אימות מוצלח של קוד. כניסת גוגל חוזרת דרך /auth/callback. */
  onSignedIn: () => void | Promise<void>;
  onBeforeRedirect?: () => void;
  externalError?: string | null;
  externalBusy?: boolean;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [ownBusy, setBusy] = useState(false);
  const busy = ownBusy || Boolean(externalBusy);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLDivElement>(null);
  // Escape, כליאת מיקוד, והחזרת המיקוד לכפתור שפתח. `undefined` כשעסוק —
  // אין טעם לאפשר בריחה באמצע אימות שכבר יצא לדרך.
  const box = useDialog(open, busy ? undefined : onCancel);

  // הטופס נפתח נקי בכל פעם. הרכיב נשאר מותקן כשהוא סגור, ובלי האיפוס הזה
  // "לא אתם?" היה מציג לחבר הבא את המייל של מי שהיה לפניו.
  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setEmail("");
    setCode("");
    setError(null);
    setBusy(false);
  }, [open]);

  // המיקוד נכנס לשדה ולא לכפתור הראשון: זה מה שמבקשים מהמשתמשת למלא.
  // רץ **אחרי** useDialog (סדר ה-hooks), ולכן גובר על המיקוד הכללי שלו.
  useEffect(() => {
    if (!open) return;
    firstField.current?.querySelector("input")?.focus();
  }, [open, step]);

  const withGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // היציאה לגוגל מאבדת את ה-state בזיכרון — שומרים לפניה.
      onBeforeRedirect?.();
      const { error: e } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            window.location.pathname,
          )}`,
        },
      });
      if (e) throw new Error(e.message);
      // הצלחה = ניווט החוצה. אין כאן מה לעדכן.
    } catch {
      setError(d.acctGoogleFailed);
      setBusy(false);
    }
  }, [onBeforeRedirect]);

  const sendCode = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // המייל של Supabase יכול לשאת גם קוד וגם קישור, תלוי בתבנית. את הקישור
      // חייבים לכוון ל-`/auth/callback` — בלי `emailRedirectTo` הוא הולך
      // ל-Site URL, כלומר לדף הבית, ושם אין מי שיחליף את הקוד בסשן: המשתמש
      // לוחץ, נוחת בעמוד הראשי, ולא קורה כלום.
      //
      // ולכן גם שומרים את מצב המשפך כאן ולא רק לפני גוגל: מי שילחץ על הקישור
      // במקום להקליד את הקוד מרענן את העמוד בדיוק כמו מסע OAuth.
      onBeforeRedirect?.();
      const { error: e } = await supabaseBrowser().auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            window.location.pathname,
          )}`,
        },
      });
      if (e) throw new Error(e.message);
      setStep("code");
    } catch {
      setError(d.acctError);
    } finally {
      setBusy(false);
    }
  }, [email, onBeforeRedirect]);

  const verify = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: e } = await supabaseBrowser().auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (e) throw new Error(e.message);
      await onSignedIn();
    } catch {
      setError(d.acctCodeInvalid);
      setBusy(false);
    }
  }, [email, code, onSignedIn]);

  if (!open) return null;

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const codeOk = /^\d{6}$/.test(code.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={d.acctTitle}
    >
      <div
        ref={box}
        className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto border border-graphite/15 bg-white p-7"
      >
        <h2 className="mb-2 text-[22px] font-semibold tracking-tight text-graphite">
          {step === "code" ? d.acctCodeTitle : d.acctTitle}
        </h2>
        <p className="mb-6 text-[15px] leading-relaxed text-ink60">
          {step === "code" ? `${d.acctCodeSentTo} ${email.trim()}` : d.acctSubtitle}
        </p>

        {!authConfigured ? (
          <p className="text-[13px] text-[#c0413b]">{d.acctUnavailable}</p>
        ) : step === "choose" ? (
          <>
            <button
              type="button"
              onClick={() => void withGoogle()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-[2px] border border-graphite/25 bg-white px-6 py-3 text-base font-medium text-graphite transition-colors hover:bg-porcelain disabled:opacity-50"
            >
              <GoogleMark />
              {d.acctGoogle}
            </button>

            <div className="my-5 flex items-center gap-3 text-[13px] text-mist">
              <span className="h-px flex-1 bg-graphite/12" />
              {d.acctOr}
              <span className="h-px flex-1 bg-graphite/12" />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (emailOk && !busy) void sendCode();
              }}
            >
              <div ref={firstField}>
                <TextInput
                  label={d.acctEmail}
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder={d.acctEmailPh}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={!emailOk || busy}
                className={`mt-4 w-full rounded-[2px] px-[30px] py-3 text-base font-semibold text-porcelain transition-colors ${
                  !emailOk || busy ? "cursor-not-allowed bg-graphite/25" : "bg-graphite hover:bg-graphite/90"
                }`}
              >
                {busy ? d.acctSending : d.acctSendCode}
              </button>
            </form>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (codeOk && !busy) void verify();
            }}
          >
            <div ref={firstField}>
              <TextInput
                label={d.acctCodeLabel}
                value={code}
                onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                dir="ltr"
                required
              />
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-mist">{d.acctCodeOrLink}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-mist">{d.acctCodeSpam}</p>
            <button
              type="submit"
              disabled={!codeOk || busy}
              className={`mt-4 w-full rounded-[2px] px-[30px] py-3 text-base font-semibold text-porcelain transition-colors ${
                !codeOk || busy ? "cursor-not-allowed bg-graphite/25" : "bg-graphite hover:bg-graphite/90"
              }`}
            >
              {busy ? d.acctSending : d.acctCodeEnter}
            </button>
            <div className="mt-4 flex items-center justify-between gap-3 text-[13px]">
              <button
                type="button"
                onClick={() => setStep("choose")}
                disabled={busy}
                className="text-ink60 underline-offset-4 hover:underline disabled:opacity-50"
              >
                {d.acctCodeOtherEmail}
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={busy}
                className="text-lapis underline-offset-4 hover:underline disabled:opacity-50"
              >
                {d.acctCodeResend}
              </button>
            </div>
          </form>
        )}

        {(error ?? externalError) && (
          <p className="mt-4 text-[13px] text-[#c0413b]">{error ?? externalError}</p>
        )}

        {step === "choose" && authConfigured && (
          <p className="mt-5 text-[13px] leading-relaxed text-mist">{d.acctNote}</p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-[13px] text-ink60 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {d.acctCancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** הלוגו של גוגל. נדרש על ידי הנחיות המיתוג שלהם על כפתור כניסה. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.4-5.7z" />
      <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.4 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" />
    </svg>
  );
}

/** "מחוברים כ־X · לא אתם?" — שורה דקה מעל המשפך. */
export function AccountBar({ name, onSwitch }: { name: string; onSwitch: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[13px] text-ink60">
      <span>
        {d.acctSignedIn}
        <span className="font-semibold text-graphite">{name}</span>
      </span>
      <button
        type="button"
        onClick={onSwitch}
        className="text-lapis underline-offset-4 hover:underline"
      >
        {d.acctSwitch}
      </button>
    </div>
  );
}
