"use client";

import { useState } from "react";
import { he } from "@/i18n/he";

const s = he.site;

const inputCls =
  "w-full rounded-[2px] border border-graphite/20 bg-white px-4 py-3 text-sm text-graphite outline-none transition-colors focus:border-lapis focus:ring-2 focus:ring-lapis/20";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError(s.contactErrorRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(s.contactErrorEmail);
      return;
    }
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
      setError(s.contactErrorSend);
    }
  }

  if (status === "sent") {
    return (
      <p className="rounded-[2px] border border-graphite/10 bg-white p-4 text-sm text-graphite">
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
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
