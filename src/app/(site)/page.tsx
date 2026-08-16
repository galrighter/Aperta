import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import { ManifestoStrip } from "@/components/site/ManifestoStrip";
import { StoryShowcase } from "@/components/story/StoryShowcase";

const s = he.site;

export const metadata: Metadata = {
  title: s.titleHe,
  description: s.gatesMetaDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: s.titleHe,
    description: s.gatesMetaDescription,
    url: "/",
  },
};

/**
 * דלת אחת בצומת. שתי הדלתות זהות במבנה ובמשקל — בכוונה: שני המסלולים הם
 * מסלולי המרה מלאים שמסתיימים באותו מוצר, והיררכיה ביניהם הייתה מטה את
 * התנועה מראש. ההבדל היחיד הוא במילים.
 *
 * הגוף מגיע בשתי גרסאות: המלא לדסקטופ, והקצר לנייד — שם כל שורה נלקחת
 * מהמטרה של המסך הראשון (ראו ההערה על ה-hero למטה).
 */
function Gate({
  eyebrow, title, body, bodyShort, steps, cta, href,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bodyShort: string;
  steps: readonly string[];
  cta: string;
  href: string;
}) {
  return (
    <article className="flex flex-col items-start bg-chalk p-5 sm:p-8">
      <div className="mb-1.5 font-display text-[10px] tracking-[0.26em] text-lapis-ink sm:mb-2.5 sm:text-[11px]">
        {eyebrow}
      </div>
      <h2 className="mb-1.5 text-[20px] font-semibold sm:mb-2.5 sm:text-[26px]" style={{ letterSpacing: "-0.5px" }}>
        {title}
      </h2>
      <p className="mb-3 hidden max-w-[42ch] text-[15.5px] leading-relaxed text-ink80 sm:block sm:flex-1" style={{ textWrap: "pretty" }}>
        {body}
      </p>
      <p className="mb-2.5 text-[13px] leading-snug text-ink80 sm:hidden">{bodyShort}</p>
      {/* ארבעת השלבים — הדפוס של StoryHome: שורה אחת, מילה לשלב, מספרים
          דקורטיביים (הסדר כבר במבנה הרשימה, ולכן מוסתרים מקורא מסך). */}
      <ol className="mb-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 sm:mb-5 sm:gap-x-3.5">
        {steps.map((step, i) => (
          <li key={step} className="flex items-baseline gap-1 whitespace-nowrap">
            <span aria-hidden="true" className="font-display text-[9px] tracking-[0.16em] text-lapis-ink">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[12px] font-medium text-graphite sm:text-[13.5px]">{step}</span>
          </li>
        ))}
      </ol>
      <Link
        href={href}
        className="w-full rounded-[2px] bg-graphite px-6 py-3 text-center text-[15px] font-semibold tracking-wide text-porcelain transition-colors hover:bg-graphite/90 sm:w-auto sm:px-8 sm:py-3.5 sm:text-[16px]"
      >
        {cta}
      </Link>
    </article>
  );
}

// דף הבית "שני שערים" — הצומת של שני המסלולים.
//
// דף הבית מחליף כאן תפקיד: ממכירת מסלול אחד לניתוב בין שניים. הצהרת המותג
// (handoff v3) נשארת למעלה, ומתחתיה שתי דלתות שוות-משקל — תכנון לפי דרישות
// (`/design`) או יצירה מסיפור (`/story/create`). את עבודת השכנוע הממוקדת
// עושים דפי הנחיתה שנשארו כפי שהם: `/story` והדף הישן ב-`/design-yours`.
//
// **המסך הראשון בנייד: hero + שתי הדלתות, בלי גלילה.** מכאן הקיצוצים:
// תת-הכותרת מוסתרת בנייד, גוף הדלת מתקצר לשורה, והריפודים הדוקים. אותו
// עיקרון שהוחל על הוויטרינה של `/story` — `min-h` ולא `h`, כדי שמי שהגדילה
// גופן תקבל גלישה ולא חיתוך.
//
// תמונת הצמיד של הדף הישן לא כאן: כשהעמוד הוא צומת, תמונה גדולה דוחפת את
// ההחלטה אל מתחת לקו הקיפול. את "מה יוצא מזה" מראה הוויטרינה שמתחת לצומת.
export default function HomePage() {
  return (
    <>
      {/* המסך הראשון: hero ממורכז + הצומת */}
      <section
        className="mx-auto flex w-full max-w-[1240px] flex-col justify-center px-5 pb-8 pt-8 sm:px-10 sm:pb-12 sm:pt-14"
        style={{ minHeight: "calc(100svh - var(--ap-header-h, 68px))" }}
      >
        <div className="text-center">
          <div className="mb-3 font-display text-[10px] tracking-[0.42em] text-lapis sm:mb-5 sm:text-xs">
            {s.heroEyebrow}
          </div>
          <h1
            className="mx-auto mb-3 max-w-[16ch] text-[clamp(32px,8vw,62px)] font-semibold leading-[1.05] sm:mb-4"
            style={{ letterSpacing: "-2px", textWrap: "balance" }}
          >
            {s.heroTitleLine1}
            <br />
            {s.heroTitleLine2}
          </h1>
          {/* בנייד המשפט הזה הוא ההפרש בין צומת שנכנס במסך הראשון לצומת שנחתך;
              ה-eyebrow והכותרת נושאים את המסר לבד. */}
          <p
            className="mx-auto hidden max-w-[47ch] text-[18px] leading-relaxed text-ink80 sm:block"
            style={{ textWrap: "pretty" }}
          >
            {s.gatesSubtitle}
          </p>
        </div>

        {/* הצומת. מסגרת הלאפיס המוסטת — הדקורציה החתומה של המותג — עוטפת את
            שתי הדלתות יחד: היא מסמנת "זה הדבר בעמוד" בלי להעדיף דלת. */}
        <div className="relative mx-auto mt-6 w-full max-w-[880px] sm:mt-11">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-3 -left-3 h-full w-full border-[1.5px] border-lapis/40 sm:-top-4 sm:-left-4"
          />
          <div className="relative grid gap-px border border-graphite/[0.14] bg-graphite/[0.14] sm:grid-cols-2">
            <Gate
              eyebrow={s.gatePlanEyebrow}
              title={s.gatePlanTitle}
              body={s.gatePlanBody}
              bodyShort={s.gatePlanBodyShort}
              steps={s.gatePlanSteps}
              cta={s.gatePlanCta}
              href="/design"
            />
            <Gate
              eyebrow={s.gateStoryEyebrow}
              title={s.gateStoryTitle}
              body={s.gateStoryBody}
              bodyShort={s.gateStoryBodyShort}
              steps={s.gateStorySteps}
              cta={s.gateStoryCta}
              href="/story/create"
            />
          </div>
        </div>

        <p className="mt-6 text-center font-display text-[11px] tracking-[0.14em] text-mist sm:mt-8 sm:text-[12px]">
          {s.gatesPriceNote}
        </p>
      </section>

      {/* הוויטרינה — ההוכחה שמתחת לצומת: סיפור כלשונו וההדמיה שיצאה ממנו.
          אותה ויטרינה של `/story`, במצב מצומצם: שורת "מה שחזר" נשארת שם,
          כי שם היא מלמדת את פעולת הבחירה; כאן התפקיד הוא הוכחה, לא לימוד.

          במצב הזה אין צעיף: הרקע שקוף, כדי שהוויטרינה לא תיקרא כריבוע שמנת
          גדול באמצע העמוד — המסגרת המוסטת לבדה אומרת "כאן דוגמה". מ-sm ומעלה
          הסיפור וההדמיה עומדים זה לצד זה, והרוחב מיושר לרוחב הצומת שמעל. */}
      <section className="mx-auto w-full max-w-[1240px] overflow-x-clip px-5 pb-16 pt-4 sm:px-10 sm:pb-20">
        <h2 className="mb-6 text-center font-display text-[11px] font-normal tracking-[0.32em] text-lapis-ink sm:mb-8">
          {s.gatesVitrineLead}
        </h2>
        <div className="relative mx-auto max-w-[560px] sm:max-w-[880px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-3 -left-3 h-full w-full border-[1.5px] border-lapis/40 sm:-top-4 sm:-left-4"
          />
          <StoryShowcase className="relative" variant="compact" />
        </div>
      </section>

      <ManifestoStrip />
    </>
  );
}
