"use client";

// handoff §8 — כתובת למשלוח + סיכום דביק + מסך אישור.
// שינוי מודע מול ה-handoff: לא נאספים פרטי כרטיס אשראי. אין ספק תשלומים
// מחובר, ואיסוף מספרי כרטיס באתר חי הוא חשיפה אמיתית ללקוחה. במקומו —
// שליחת ההזמנה ותיאום תשלום אישי (§12 ממילא מסמן תמחור/תשלום כפער פתוח).
import { useState } from "react";
import Link from "next/link";
import { he } from "@/i18n/he";
import { formatPhone, isValidPhone } from "@/lib/phone";
import { addressLineValid, nameValid, zipValid } from "@/lib/address";
import { Eyebrow, ScreenTitle, CardLabel, CheckBox, PrimaryBtn, TextInput } from "./ui";
import { activeEntry, circumferenceMm, frameWidthMm, mmLabel, priceOf, type Addr, type CreateState } from "./model";

const d = he.design;

const REQUIRED: Array<keyof Addr> = ["name", "street", "city", "phone", "email"];

export const emailValid = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export const addrValid = (a: Addr): boolean =>
  REQUIRED.every((k) => a[k].trim().length > 0) &&
  nameValid(a.name) &&
  addressLineValid(a.street) &&
  addressLineValid(a.city) &&
  zipValid(a.zip) &&
  emailValid(a.email) &&
  // הטלפון הוא הדרך לאשר שרטוט לפני ייצור. מספר שגוי אינו שדה ריק שרואים —
  // הוא נראה מלא ומתגלה רק כשאי אפשר להשיג את הלקוחה.
  isValidPhone(a.phone);

/** אילו שדות המשתמשת כבר יצאה מהם. שגיאה מוצגת רק עליהם. */
type Touched = Partial<Record<keyof Addr, boolean>>;

export function CheckoutScreen({
  s, set, onSubmit, accountEmail,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onSubmit: () => void;
  /** המייל של המחוברת — מוצג כהסבר מתחת לשדה כשהוא זה שמילא אותו. */
  accountEmail?: string | null;
}) {
  const p = priceOf(s);
  const ring = s.product === "ring";
  const width = frameWidthMm(s, activeEntry(s));
  // התנאים נכללים בשער. הם אושרו במסך הסיכום, אבל האישור חי ב-state בזיכרון
  // ומה שנשמר בשרת חייב עדות מהרגע שבו ההזמנה נשלחה — ראו את תיבת הסימון למטה.
  const ok = addrValid(s.addr) && s.terms;
  const setAddr = (patch: Partial<Addr>) => set({ addr: { ...s.addr, ...patch } });

  // השגיאה נכתבת ביציאה מהשדה ולא בהקלדה: "מספר לא תקין" על התו הראשון הוא
  // נכון טכנית וטורדני בכל שאר המובנים — אף אחד לא מקליד טלפון תקין באות אחת.
  const [touched, setTouched] = useState<Touched>({});
  const touch = (k: keyof Addr) => setTouched((t) => ({ ...t, [k]: true }));

  const errorFor = (k: keyof Addr): string | null => {
    if (!touched[k]) return null;
    const v = s.addr[k].trim();
    if (!v) return REQUIRED.includes(k) ? d.addrErrors.required : null;
    if (k === "phone" && !isValidPhone(v)) return d.addrErrors.phone;
    if (k === "email" && !emailValid(v)) return d.addrErrors.email;
    if (k === "name" && !nameValid(v)) return d.addrErrors.name;
    if ((k === "street" || k === "city") && !addressLineValid(v)) return d.addrErrors.line;
    if (k === "zip" && !zipValid(v)) return d.addrErrors.zip;
    return null;
  };

  // יציאה משדה הטלפון מיישרת גם את הצורה: `+972 50 123 4567` ו-`0501234567`
  // הם אותו מספר, ומי שרואה אותו חוזר כ-`050-1234567` יודע שהמספר נקלט.
  const blurPhone = () => {
    touch("phone");
    const tidy = formatPhone(s.addr.phone);
    if (tidy !== s.addr.phone) setAddr({ phone: tidy });
  };

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
                  label={d.addrFields.name} required placeholder={d.addrPlaceholders.name}
                  value={s.addr.name} onChange={(v) => setAddr({ name: v })}
                  onBlur={() => touch("name")} error={errorFor("name")}
                  autoComplete="name"
                />
              </div>
              <div className="sm:col-span-2">
                <TextInput
                  label={d.addrFields.street} required placeholder={d.addrPlaceholders.street}
                  value={s.addr.street} onChange={(v) => setAddr({ street: v })}
                  onBlur={() => touch("street")} error={errorFor("street")}
                  autoComplete="street-address"
                />
              </div>
              <TextInput
                label={d.addrFields.city} required placeholder={d.addrPlaceholders.city}
                value={s.addr.city} onChange={(v) => setAddr({ city: v })}
                onBlur={() => touch("city")} error={errorFor("city")}
                autoComplete="address-level2"
              />
              <TextInput
                label={d.addrFields.zip} placeholder={d.addrPlaceholders.zip}
                value={s.addr.zip} onChange={(v) => setAddr({ zip: v })}
                onBlur={() => touch("zip")} error={errorFor("zip")}
                inputMode="numeric" autoComplete="postal-code"
              />
              <TextInput
                label={d.addrFields.phone} required type="tel" placeholder={d.addrPlaceholders.phone}
                value={s.addr.phone} onChange={(v) => setAddr({ phone: v })}
                onBlur={blurPhone} error={errorFor("phone")}
                inputMode="tel" dir="ltr" autoComplete="tel"
              />
              <TextInput
                label={d.addrFields.email} required type="email" placeholder={d.addrPlaceholders.email}
                value={s.addr.email} onChange={(v) => setAddr({ email: v })}
                onBlur={() => touch("email")} error={errorFor("email")}
                hint={
                  accountEmail && s.addr.email.trim() === accountEmail ? d.emailFromAccount : null
                }
                inputMode="email" dir="ltr" autoComplete="email"
              />
            </div>

            {/* מלכודת הבוטים. השדה קיים בסכימת השרת מאז ההתחלה, אבל מעולם לא
                הוצג — כלומר שום בוט לא יכול היה למלא אותו, והמלכודת הייתה
                ריקה. מוסתר מהעין, מהמקלדת ומקורא־המסך; מה שממלא אותו הוא
                סקריפט שקורא HTML, וההזמנה שלו נבלעת בשקט. */}
            <div className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                value={s.company}
                onChange={(e) => set({ company: e.target.value })}
              />
            </div>
          </div>

          {/* אישורים */}
          <div className="mt-4 space-y-4 border border-graphite/10 bg-white p-6">
            <CheckBox on={s.terms} onChange={(v) => set({ terms: v })}>
              {d.termsLabel}{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-graphite underline underline-offset-4 hover:text-lapis"
              >
                {d.termsLink}
              </Link>
              <span className="text-lapis"> *</span>
            </CheckBox>
            {/* בנפרד, ולעולם לא מסומן מראש: מייל שנמסר כדי לקבל אישור הזמנה
                אינו הסכמה לדבר פרסומת (חוק התקשורת, סעיף 30א). */}
            <CheckBox on={s.marketing} onChange={(v) => set({ marketing: v })}>
              {d.marketingLabel}
            </CheckBox>
          </div>

          {/* תשלום */}
          <div className="mt-4 border border-graphite/10 bg-white p-6">
            <CardLabel>{d.payTitle}</CardLabel>
            <div className="border-s-2 border-lapis bg-porcelain p-5">
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
            <Row k={d.checkoutKeys.width} v={`${mmLabel(width)} ${d.mm}`} />
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
            {/* כפתור אפור בלי הסבר הוא מבוי סתום: הלקוחה מילאה הכול לתחושתה,
                והמסך שותק. השורה הזאת אומרת מה חסר, והשגיאות למעלה מראות איפה. */}
            {!ok && !s.sending && (
              <p className="mt-2 text-center text-[12px] text-ink60">{d.checkoutIncomplete}</p>
            )}
            {s.sendError && (
              <div className="mt-3 text-center text-[13px]">
                <p className="text-[#c0413b]">{s.sendError}</p>
                {s.sendMailto && (
                  <>
                    <p className="mt-2 text-ink60">{d.checkoutMailtoNote}</p>
                    <a
                      href={s.sendMailto}
                      className="mt-1 inline-block font-semibold text-graphite underline underline-offset-4 hover:text-lapis"
                    >
                      {d.checkoutMailtoCta}
                    </a>
                  </>
                )}
              </div>
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
