"use client";

import { useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";

const s = he.site;

const ERROR_ID = "contact-error";

const inputCls =
  "w-full rounded-[2px] border border-graphite/20 bg-white px-4 py-3 text-sm text-graphite outline-none transition-colors focus:border-lapis focus:ring-2 focus:ring-lapis/20";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  // איזה שדה פסל את השליחה. בלי זה `aria-invalid` היה יושב על כל השדות או על
  // אף אחד, ומי שמנווט ביניהם שומע "שגיאה" בלי לדעת איפה.
  const [badField, setBadField] = useState<"name" | "email" | "message" | null>(null);
  const sentRef = useRef<HTMLParagraphElement>(null);

  // הודעת ההצלחה מחליפה את הטופס כולו, כלומר הכפתור שהיה במיקוד נמחק מה-DOM
  // והמיקוד נופל לתחילת המסמך. משתמש מקלדת מאבד את מקומו, ומשתמש קורא-מסך
  // אינו שומע דבר — הטופס פשוט נעלם. העברת המיקוד לפסקה היא ההודעה.
  useEffect(() => {
    if (status === "sent") sentRef.current?.focus();
  }, [status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setBadField(!name.trim() ? "name" : !email.trim() ? "email" : "message");
      setError(s.contactErrorRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setBadField("email");
      setError(s.contactErrorEmail);
      return;
    }
    setBadField(null);
    setError(null);
    setStatus("sending");
    // הטופס פונה ל-backend הפניות (kind="contact"): הפנייה נשמרת, מופיעה בלשונית
    // "פניות" בבק־אופיס, וגם נשלח מייל התראה לגל. mailto נשאר כקישור גיבוי מפורש
    // מתחת — הוא שקט למי שאין לו תוכנת דואר, ולכן לא יכול להיות מסלול השליחה.
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "contact",
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("idle");
      setBadField(null);
      setError(s.contactErrorSend);
    }
  }

  if (status === "sent") {
    return (
      <p
        ref={sentRef}
        tabIndex={-1}
        role="status"
        className="rounded-[2px] border border-graphite/10 bg-white p-4 text-sm text-graphite focus:outline-none"
      >
        {s.contactSuccess}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor="c-name" className="mb-1 block text-sm font-medium text-ink80">
          {s.contactName}
        </label>
        <input
          id="c-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={s.contactNamePlaceholder}
          className={inputCls}
          autoComplete="name"
          aria-invalid={badField === "name" || undefined}
          aria-describedby={badField === "name" ? ERROR_ID : undefined}
        />
      </div>
      <div>
        <label htmlFor="c-email" className="mb-1 block text-sm font-medium text-ink80">
          {s.contactEmail}
        </label>
        <input
          id="c-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={s.contactEmailPlaceholder}
          className={inputCls}
          dir="ltr"
          autoComplete="email"
          aria-invalid={badField === "email" || undefined}
          aria-describedby={badField === "email" ? ERROR_ID : undefined}
        />
      </div>
      <div>
        <label htmlFor="c-msg" className="mb-1 block text-sm font-medium text-ink80">
          {s.contactMessage}
        </label>
        <textarea
          id="c-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={s.contactMessagePlaceholder}
          rows={5}
          className={`${inputCls} resize-y`}
          aria-invalid={badField === "message" || undefined}
          aria-describedby={badField === "message" ? ERROR_ID : undefined}
        />
      </div>

      {/* `role="alert"` — השגיאה נכתבת אחרי לחיצה על "שליחה", כלומר היא חייבת
          להיאמר. אותו דפוס כבר בשימוש ב-SizesScreen וב-BriefScreen. */}
      {error && (
        <p id={ERROR_ID} role="alert" className="text-sm text-failred">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-1 rounded-[2px] bg-graphite px-8 py-3.5 text-sm font-semibold text-porcelain transition-colors hover:bg-graphite/90 disabled:opacity-60"
      >
        {status === "sending" ? s.contactSending : s.contactSubmit}
      </button>
    </form>
  );
}
