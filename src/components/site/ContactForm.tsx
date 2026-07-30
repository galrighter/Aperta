"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";

const s = he.site;

const inputCls =
  "w-full rounded-[2px] border border-graphite/20 bg-white px-4 py-3 text-sm text-graphite outline-none transition-colors focus:border-cobalt focus:ring-2 focus:ring-cobalt/20";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
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
    const subject = `${s.brand} — ${name.trim()}`;
    const body = `${message.trim()}\n\n— ${name.trim()} (${email.trim()})`;
    window.location.href = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
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
        className="mt-1 rounded-[2px] bg-graphite px-8 py-3.5 text-sm font-semibold text-porcelain transition-colors hover:bg-graphite/90"
      >
        {s.contactSubmit}
      </button>
    </form>
  );
}
