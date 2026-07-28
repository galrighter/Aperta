"use client";

// שער הזיהוי. נפתח ברגע שבו מבקשים מהמנוע ליצור — ולא בכניסה לעמוד.
//
// למה שם: המסכים שלפניו (בחירת מוצר, מידות, תיאור) הם ההתנסות שמשכנעת, וטופס
// לפניהם מגרש מבקר שעוד לא יודע מה הוא מקבל. הרגע שאחריהם הוא גם הרגע היקר —
// כל יצירה היא הרצת מנוע — וגם הרגע שבו נוצרת רשומה שצריכה בעלים.
import { useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { TextInput } from "./ui";

const d = he.design;

export function AccountGate({
  open, onSubmit, onCancel, error, busy,
}: {
  open: boolean;
  onSubmit: (v: { name: string; email: string; phone?: string; company?: string }) => void;
  onCancel: () => void;
  error: string | null;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // honeypot — אותו דפוס כמו בטופס יצירת הקשר
  const [company, setCompany] = useState("");
  const firstField = useRef<HTMLDivElement>(null);

  // הטופס נפתח ריק בכל פעם. הרכיב נשאר מותקן כשהוא סגור, ובלי האיפוס הזה
  // "לא אתם?" היה מציג לחבר הבא את השם והמייל של מי שהיה לפניו.
  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    firstField.current?.querySelector("input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const ready = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={d.acctTitle}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || busy) return;
          onSubmit({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
            company: company || undefined,
          });
        }}
        className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto border border-graphite/15 bg-white p-7"
      >
        <h2 className="mb-2 text-[22px] font-semibold tracking-tight text-graphite">
          {d.acctTitle}
        </h2>
        <p className="mb-6 text-[15px] leading-relaxed text-ink60">{d.acctSubtitle}</p>

        <div className="flex flex-col gap-4">
          <div ref={firstField}>
            <TextInput label={d.acctName} value={name} onChange={setName} placeholder={d.acctNamePh} required />
          </div>
          <TextInput label={d.acctEmail} value={email} onChange={setEmail} type="email" required />
          <TextInput label={`${d.acctPhone} · ${d.acctPhoneOpt}`} value={phone} onChange={setPhone} type="tel" />
        </div>

        {/* לבוטים בלבד: שדה אמיתי, מוסתר מהעין ומקורא המסך */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Company
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
        </div>

        {error && <p className="mt-4 text-[13px] text-[#c0413b]">{error}</p>}

        <p className="mt-5 text-[13px] leading-relaxed text-mist">{d.acctNote}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-[13px] text-ink60 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {d.acctCancel}
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className={`rounded-[2px] px-[30px] py-3 text-base font-semibold text-porcelain transition-colors ${
              !ready || busy ? "cursor-not-allowed bg-graphite/25" : "bg-graphite hover:bg-graphite/90"
            }`}
          >
            {busy ? d.acctSending : d.acctSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}

/** "מחוברים כ־X · לא אתם?" — שורה דקה מעל המשפך. */
export function AccountBar({
  name, onSwitch,
}: {
  name: string;
  onSwitch: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[13px] text-ink60">
      <span>
        {d.acctSignedIn}
        <span className="font-semibold text-graphite">{name}</span>
      </span>
      <button
        type="button"
        onClick={onSwitch}
        className="text-cobalt underline-offset-4 hover:underline"
      >
        {d.acctSwitch}
      </button>
    </div>
  );
}
