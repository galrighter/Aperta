import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";
import FaqAccordion from "@/components/site/FaqAccordion";

const s = he.site;

export const metadata: Metadata = {
  title: `${s.faqTitle} — ${s.brand}`,
  description: s.faqSubtitle,
  alternates: { canonical: "/faq" },
};

// FAQPage — נבנית מאותו מערך שמרנדר את העמוד, ולכן אינה יכולה לסטות ממנו.
// הבהרה כדי שלא תיווצר ציפייה שגויה: גוגל הסירה את תוצאת ה-FAQ העשירה
// (מאי–יוני 2026), כלומר זה לא יופיע כאקורדיון בתוצאות. הסכימה נשארת תקפה
// ונקראת על ידי Bingbot ו-PerplexityBot — הערך כאן הוא חילוץ מובנה של זוגות
// שאלה-תשובה, לא מראה בדף התוצאות. היא באה *אחרי* תיקון ה-DOM, לא במקומו.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE.url}/faq#faq`,
  inLanguage: "he-IL",
  mainEntity: s.faqItems.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function FaqPage() {
  return (
    <div className="ap-surface mx-auto max-w-3xl px-5 py-16 sm:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {s.faqTitle}
      </h1>
      <p className="mt-3 text-lg text-ink60">{s.faqSubtitle}</p>

      <div className="mt-10">
        <FaqAccordion items={s.faqItems} />
      </div>

      {/* שני מדריכים שהתשובות למעלה מפנות אליהם במילים אבל לא בקישור. מדריך
          המידות מקושר מהניווט; `/design-rules` לא מקושר משום מקום באתר מלבד
          מסכים בתוך המשפך, שנוצרים רק אחרי ניסיון יצירה — כלומר לא היה אליו
          מסלול זחילה כלל. */}
      <p className="mt-8 text-sm leading-relaxed text-ink60">
        {s.faqGuidesLead}{" "}
        <Link href="/design-rules" className="font-medium text-lapis hover:underline">
          {s.designRules.title}
        </Link>{" "}
        {s.faqGuidesMid}{" "}
        <Link href="/sizing" className="font-medium text-lapis hover:underline">
          {s.sizing.title}
        </Link>
        {s.faqGuidesEnd}
      </p>

      <p className="mt-4 text-sm text-ink60">
        {s.contactSubtitle}{" "}
        <Link href="/contact" className="font-medium text-lapis hover:underline">
          {s.navContact}
        </Link>{" "}
        ·{" "}
        <a
          href={`mailto:${SITE.contactEmail}`}
          dir="ltr"
          className="font-medium text-lapis hover:underline"
        >
          {SITE.contactEmail}
        </a>
      </p>
    </div>
  );
}
