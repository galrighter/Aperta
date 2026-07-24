"use client";

// handoff §8 — כתובת למשלוח + סיכום דביק + מסך אישור.
// שינוי מודע מול ה-handoff: לא נאספים פרטי כרטיס אשראי. אין ספק תשלומים
// מחובר, ואיסוף מספרי כרטיס באתר חי הוא חשיפה אמיתית ללקוחה. במקומו —
// שליחת ההזמנה ותיאום תשלום אישי (§12 ממילא מסמן תמחור/תשלום כפער פתוח).
import { he } from "@/i18n/he";
import { Eyebrow, ScreenTitle, CardLabel, PrimaryBtn, TextInput } from "./ui";
import { circumferenceMm, priceOf, widthOf, type Addr, type CreateState } from "./model";

const d = he.design;

const REQUIRED: Array<keyof Addr> = ["name", "street", "city", "phone", "email"];

export const addrValid = (a: Addr): boolean =>
  REQUIRED.every((k) => a[k].trim().length > 0) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim());

export function CheckoutScreen({
  s, set, onSubmit,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onSubmit: () => void;
}) {
  const p = priceOf(s);
  const ring = s.product === "ring";
  const ok = addrValid(s.addr);
  const setAddr = (patch: Partial<Addr>) => set({ addr: { ...s.addr, ...patch } });

  return (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-10">
      <Eyebrow>{d.checkoutEyebrow}</Eyebrow>
      <ScreenTitle>{d.checkoutTitle}</ScreenTitle>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {/* כתובת */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.addrTitle}</CardLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextInput
                  label={d.addrFields.name} required
                  value={s.addr.name} onChange={(v) => setAddr({ name: v })}
                />
              </div>
              <div className="sm:col-span-2">
                <TextInput
                  label={d.addrFields.street} required
                  value={s.addr.street} onChange={(v) => setAddr({ street: v })}
                />
              </div>
              <TextInput
                label={d.addrFields.city} required
                value={s.addr.city} onChange={(v) => setAddr({ city: v })}
              />
              <TextInput
                label={d.addrFields.zip}
                value={s.addr.zip} onChange={(v) => setAddr({ zip: v })}
              />
              <TextInput
                label={d.addrFields.phone} required type="tel"
                value={s.addr.phone} onChange={(v) => setAddr({ phone: v })}
              />
              <TextInput
                label={d.addrFields.email} required type="email"
                value={s.addr.email} onChange={(v) => setAddr({ email: v })}
              />
            </div>
          </div>

          {/* תשלום */}
          <div className="mt-4 border border-graphite/10 bg-white p-6">
            <CardLabel>{d.payTitle}</CardLabel>
            <div className="border-s-2 border-cobalt bg-porcelain p-5">
              <div className="mb-2 text-sm font-semibold text-graphite">{d.payPendingTitle}</div>
              <p className="text-sm leading-relaxed text-ink80" style={{ textWrap: "pretty" }}>
                {d.payPendingBody}
              </p>
            </div>
          </div>
        </div>

        {/* סיכום דביק */}
        <div className="lg:sticky lg:top-[104px]">
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.checkoutSummaryTitle}</CardLabel>
            <Row k={d.checkoutKeys.item} v={ring ? d.ringName : d.braceletName} />
            <Row k={d.checkoutKeys.size} v={`${Math.round(circumferenceMm(s))} ${d.mm}`} />
            <Row k={d.checkoutKeys.width} v={`${widthOf(s)} ${d.mm}`} />
            <Row k={d.checkoutKeys.delivery} v={d.deliveryVal} />

            <div className="mt-3 flex items-baseline justify-between border-t border-graphite/15 pt-3.5">
              <span className="text-base font-semibold text-graphite">{d.checkoutTotal}</span>
              <span className="font-display text-2xl font-bold text-graphite">
                {d.ils}{p.total}
              </span>
            </div>

            <div className="mt-5">
              <PrimaryBtn onClick={onSubmit} disabled={!ok || s.sending} full>
                {s.sending ? d.checkoutSending : d.checkoutSubmit}
              </PrimaryBtn>
            </div>
            {s.sendError && (
              <p className="mt-3 text-center text-[13px] text-[#c0413b]">{d.checkoutError}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-graphite/[0.07] py-2.5 text-sm last:border-b-0">
      <span className="text-ink60">{k}</span>
      <span className="text-end font-semibold text-graphite">{v}</span>
    </div>
  );
}
