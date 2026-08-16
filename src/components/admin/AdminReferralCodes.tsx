"use client";

// קודי ההפניה (0026) — יצירה, מכסה, וכיבוי.
//
// המסך הזה קיים כדי שקוד לחנות חדשה לא יהיה SQL. הוא מכוון למקרה שגל באמת
// עושה: קוד אחד לקמפיין, מחיר סופי לשני המוצרים, ומכסה. הכלל האחוזי קיים
// במסד (`kind = 'percent_off'`) אבל אין לו טופס כאן — הוא ייבנה כשתתקבל
// ההחלטה להשתמש בו, ושדה שאין בו צורך הוא שדה שאפשר למלא בטעות.

import { useState } from "react";
import { he } from "@/i18n/he";
import { useAdminData, type AuthLost } from "@/lib/client/useAdminData";
import type { ReferralCodeWithUsage } from "@/lib/db/referralCodes";

const s = he.site;
const d = he.design;

export default function AdminReferralCodes({ onAuthLost }: { onAuthLost: AuthLost }) {
  const { data, error, schemaOutdated, isLoading, refresh } = useAdminData<{
    codes: ReferralCodeWithUsage[];
  }>("/api/referral-codes", { onAuthLost });

  const codes = data?.codes ?? [];

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-tight text-graphite">
        {s.adminReferralsTitle}
      </h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-ink60">
        {s.adminReferralsIntro}
      </p>

      <NewCodeForm onCreated={() => void refresh()} />

      {schemaOutdated && <Notice>{s.adminReferralsSchema}</Notice>}
      {error && !schemaOutdated && <Notice>{s.adminReferralsError}</Notice>}
      {!isLoading && !error && !schemaOutdated && codes.length === 0 && (
        <Notice>{s.adminReferralsEmpty}</Notice>
      )}

      {codes.length > 0 && (
        <div className="mt-8 overflow-x-auto border border-graphite/10 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-graphite/10 text-right text-[12px] text-ink60">
                <Th>{s.adminReferralColCode}</Th>
                <Th>{s.adminReferralColLabel}</Th>
                <Th>{s.adminReferralColPrice}</Th>
                <Th>{s.adminReferralColUsed}</Th>
                <Th>{s.adminReferralColExpires}</Th>
                <Th>{s.adminReferralColActive}</Th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <CodeRow key={c.id} code={c} onChanged={() => void refresh()} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CodeRow({ code, onChanged }: { code: ReferralCodeWithUsage; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await fetch(`/api/referral-codes/${code.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !code.active }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const price =
    code.kind === "percent_off"
      ? `${s.adminReferralPercent} ${code.percent_off}%`
      : code.base_prices
        ? `${d.ils}${code.base_prices.bracelet} / ${d.ils}${code.base_prices.ring}`
        : "—";

  // "3 / 25" ולא "22 נותרו": המונה עונה גם על "כמה מומשו" וגם על "כמה נשאר",
  // ומכסה פתוחה אינה מסתירה את מספר המימושים — שהוא המספר המעניין בקוד חנות.
  const used = code.max_uses == null ? `${code.used} · ${s.adminReferralUnlimited}` : `${code.used} / ${code.max_uses}`;

  return (
    <tr className={`border-b border-graphite/[0.07] last:border-b-0 ${code.active ? "" : "opacity-55"}`}>
      <Td>
        <span dir="ltr" className="font-mono text-[13px] font-semibold text-graphite">
          {code.code}
        </span>
      </Td>
      <Td>{code.label}</Td>
      <Td>{price}</Td>
      <Td>{used}</Td>
      <Td>
        {code.expires_at
          ? new Date(code.expires_at).toLocaleDateString("he-IL")
          : s.adminReferralNoExpiry}
      </Td>
      <Td>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="text-[13px] font-medium text-lapis underline underline-offset-4 disabled:opacity-50"
        >
          {code.active ? s.adminReferralDeactivate : s.adminReferralActivate}
        </button>
      </Td>
    </tr>
  );
}

function NewCodeForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [publicLabel, setPublicLabel] = useState("");
  const [bracelet, setBracelet] = useState("");
  const [ring, setRing] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = code.trim().length >= 3 && label.trim() !== "" && bracelet !== "" && ring !== "";

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/referral-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          label: label.trim(),
          publicLabel: publicLabel.trim() || undefined,
          kind: "fixed_price",
          basePrices: { bracelet: Number(bracelet), ring: Number(ring) },
          maxUses: maxUses ? Number(maxUses) : undefined,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { code?: string } }
          | null;
        const c = body?.error?.code;
        setErr(
          c === "code_exists"
            ? s.adminReferralExists
            : c === "invalid_code" || c === "invalid_input"
              ? s.adminReferralInvalid
              : s.adminReferralCreateError,
        );
        return;
      }
      setCode("");
      setLabel("");
      setPublicLabel("");
      setBracelet("");
      setRing("");
      setMaxUses("");
      setNote("");
      onCreated();
    } catch {
      setErr(s.adminReferralCreateError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 border border-graphite/10 bg-white p-6">
      <h2 className="text-[15px] font-semibold text-graphite">{s.adminReferralNewTitle}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={s.adminReferralFieldCode} hint={s.adminReferralFieldCodeHint}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            dir="ltr"
            className={INPUT}
          />
        </Field>
        <Field label={s.adminReferralFieldLabel} hint={s.adminReferralFieldLabelHint}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT} />
        </Field>
        <Field label={s.adminReferralFieldPublicLabel} hint={s.adminReferralFieldPublicLabelHint}>
          <input
            value={publicLabel}
            onChange={(e) => setPublicLabel(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label={s.adminReferralFieldBracelet} hint={s.adminReferralFieldPriceHint}>
          <input
            value={bracelet}
            onChange={(e) => setBracelet(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            className={INPUT}
          />
        </Field>
        <Field label={s.adminReferralFieldRing} hint={s.adminReferralFieldPriceHint}>
          <input
            value={ring}
            onChange={(e) => setRing(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            className={INPUT}
          />
        </Field>
        <Field label={s.adminReferralFieldMaxUses} hint={s.adminReferralFieldMaxUsesHint}>
          <input
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            className={INPUT}
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label={s.adminReferralFieldNote}>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={submit}
          disabled={!ready || busy}
          className="bg-graphite px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? s.adminReferralCreating : s.adminReferralCreate}
        </button>
        {err && <span className="text-[13px] text-failred">{err}</span>}
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-[2px] border border-graphite/20 bg-chalk px-3 py-2 text-sm focus:border-lapis focus:outline-none";

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink60">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mist">{hint}</span>}
    </label>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-3 font-medium">{children}</th>
);

const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-4 py-3 text-graphite">{children}</td>
);

const Notice = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-8 border border-graphite/10 bg-white p-5 text-[14px] text-ink60">{children}</p>
);
