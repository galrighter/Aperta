import type { Metadata } from "next";
import { he } from "@/i18n/he";
import LegalPage from "@/components/site/LegalPage";
import { businessIdentified, businessLines } from "@/lib/site.config";

const t = he.site.terms;

export const metadata: Metadata = {
  title: `${t.title} — ${he.site.brand}`,
  description: he.site.termsMetaDescription,
  alternates: { canonical: "/terms" },
};

/**
 * שני הסעיפים שהחוק דורש בעסקת מכר מרחוק — זהות העוסק ומדיניות הביטול —
 * נבנים כאן ולא ב-`he.ts`: הפרטים עצמם הם נתון של העסק (`SITE.business`),
 * ונוסח משפטי שמשכפל אותם הוא נוסח שיתיישן ביום שהם ישתנו.
 *
 * הם ראשונים ברשימה, לפני "השירות": מי שמחפש את מי שהוא קונה ממנו לא אמור
 * לגלול דרך סעיפי קניין רוחני כדי למצוא אותו.
 */
export default function TermsPage() {
  const sections = [
    {
      h: t.businessTitle,
      // כשאין שם ומספר, הסעיף אומר את זה במפורש במקום להציג מייל בודד
      // ולהיראות כאילו זו הזהות המלאה.
      p: businessIdentified() ? businessLines().join(" · ") : t.businessPending,
    },
    { h: t.cancelTitle, p: `${t.cancelBody} ${t.cancelMinorNote}` },
    ...t.sections,
  ];
  return <LegalPage title={t.title} intro={t.intro} sections={sections} />;
}
