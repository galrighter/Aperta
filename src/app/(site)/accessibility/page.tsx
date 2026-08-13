import type { Metadata } from "next";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";

/**
 * הצהרת נגישות — תקנה 35ה לתקנות התאמות נגישות לשירות, תשע"ג-2013.
 *
 * **למה עמוד ייעודי ולא `LegalPage`.** התנאים והפרטיות הם רצף סעיפים של כותרת
 * ופסקה, וזה בדיוק מה ש-`LegalPage` יודע לרנדר. ההצהרה אינה כזו: היא נושאת
 * שתי רשימות (מה בוצע, מה לא) וכרטיס פרטי קשר שצריך להיסרק במבט אחד — מי
 * שמחפש אותו בדרך כלל כבר נתקל במשהו שלא עבד. דחיסה של אלה לרצף פסקאות הייתה
 * קוברת את הדבר היחיד שבגללו העמוד קיים.
 *
 * העמוד סטטי לחלוטין, בלי JavaScript ובלי מצב — כדי שהוא ייקרא גם כשמשהו אחר
 * באתר נשבר. זו הנקודה שבה זה הכי חשוב.
 */

const s = he.site;
const a = s.accessibility;

export const metadata: Metadata = {
  title: `${a.title} — ${s.brand}`,
  description: a.metaDescription,
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <div className="ap-surface mx-auto max-w-2xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {a.title}
      </h1>
      <p className="mt-2 text-sm text-mist">
        {a.updatedPrefix} {a.updatedDate}
      </p>
      <p className="mt-6 leading-relaxed text-ink80" style={{ textWrap: "pretty" }}>
        {a.intro}
      </p>

      <Section title={a.commitmentTitle}>
        <p className="leading-relaxed text-ink60">{a.commitmentBody}</p>
      </Section>

      <Section title={a.levelTitle}>
        {/* המצב כשורה משלו ולא כמשפט בתוך פסקה: זו העובדה שבודק חיצוני מחפש,
            והיא צריכה להיות קריאה בסריקה ולא בקריאה. */}
        <p className="mb-2 inline-block border-s-2 border-lapis bg-chalk px-4 py-2 text-sm font-semibold text-graphite">
          {a.levelStatus}
        </p>
        <p className="leading-relaxed text-ink60">{a.levelBody}</p>
      </Section>

      <Section title={a.scopeTitle}>
        <p className="leading-relaxed text-ink60">{a.scopeBody}</p>
        <p className="mt-3 leading-relaxed text-ink60">{a.scopeExcludedBody}</p>
      </Section>

      <Section title={a.doneTitle}>
        <List items={a.done} />
      </Section>

      <Section title={a.gapsTitle}>
        <p className="leading-relaxed text-ink60">{a.gapsIntro}</p>
        <List items={a.gaps} className="mt-3" />
      </Section>

      <Section title={a.testedTitle}>
        <p className="leading-relaxed text-ink60">{a.testedBody}</p>
      </Section>

      {/* ===== פרטי הקשר — הסיבה שהעמוד קיים ===== */}
      <section className="mt-10 border border-graphite/15 bg-chalk p-6">
        <h2 className="text-lg font-semibold text-graphite">{a.contactTitle}</h2>
        <p className="mt-2 leading-relaxed text-ink60">{a.contactBody}</p>

        <dl className="mt-5 flex flex-col gap-2.5 text-sm">
          <Row label={a.contactRoleLabel}>
            <span className="font-medium text-graphite">{SITE.accessibility.name}</span>
          </Row>
          <Row label={a.contactEmailLabel}>
            {/* `bdi` ולא `dir="ltr"` — אותו נימוק כמו בפוטר: dir על האלמנט הופך
                גם את היישור שלו, והכתובת הייתה נצמדת לשמאל בתוך שורה ימנית. */}
            <a href={`mailto:${SITE.accessibility.email}`} className="font-medium text-lapis hover:underline">
              <bdi>{SITE.accessibility.email}</bdi>
            </a>
          </Row>
          {SITE.accessibility.phone && (
            <Row label={a.contactPhoneLabel}>
              <a href={`tel:${SITE.accessibility.phone}`} className="font-medium text-lapis hover:underline">
                <bdi>{SITE.accessibility.phone}</bdi>
              </a>
            </Row>
          )}
          <Row label={a.contactResponseLabel}>
            <span className="text-ink80">
              {a.contactResponseValue(SITE.accessibility.responseDays)}
            </span>
          </Row>
        </dl>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-graphite">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function List({ items, className = "" }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-2.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 leading-relaxed text-ink60">
          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lapis" />
          <span style={{ textWrap: "pretty" }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** שורה ב-`<dl>`. `dt`/`dd` ולא שני `span`: זו באמת רשימת מונח-והגדרה. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-ink60">{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
