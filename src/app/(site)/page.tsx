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
 * **בלי רקע.** הדלת שקופה — כמו הוויטרינה שמתחתיה: כרטיס `chalk` נקרא על
 * הדקורציה כריבוע לבן גדול. הטקסט יושב ישירות על `ArchBackground`, ולכן כל
 * הטוקנים הקטנים כאן הם אלה שעוברים 4.5:1 גם מול קו הקצה של הלוח —
 * `lapis-ink` ו-`ink80`, אותה הכרעה של StoryHome. הגבול היחיד הוא קו המתאר
 * של הצומת וקו ההפרדה בין הדלתות.
 *
 * הגוף מגיע בשתי גרסאות: המלא לדסקטופ, והקצר לנייד — שם שתי הדלתות עומדות
 * זו לצד זו בעמודות צרות, וכל שורה נלקחת מהמטרה של המסך הראשון.
 */
function Gate({
  eyebrow, title, body, bodyShort, steps, cta, href, divider = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bodyShort: string;
  steps: readonly string[];
  cta: string;
  href: string;
  /** קו הפרדה בצד הפתיחה — לדלת השנייה בצומת. */
  divider?: boolean;
}) {
  return (
    <article
      className={`flex min-w-0 flex-col items-start p-3.5 sm:p-8 ${
        divider ? "border-s border-graphite/[0.14]" : ""
      }`}
    >
      <div className="mb-1.5 font-display text-[9px] tracking-[0.18em] text-lapis-ink sm:mb-2.5 sm:text-[11px] sm:tracking-[0.26em]">
        {eyebrow}
      </div>
      <h2 className="mb-1.5 text-[17px] font-semibold sm:mb-2.5 sm:text-[26px]" style={{ letterSpacing: "-0.5px" }}>
        {title}
      </h2>
      <p className="mb-3 hidden max-w-[42ch] text-[15.5px] leading-relaxed text-ink80 sm:block sm:flex-1" style={{ textWrap: "pretty" }}>
        {body}
      </p>
      <p className="mb-2.5 flex-1 text-[12px] leading-snug text-ink80 sm:hidden" style={{ textWrap: "pretty" }}>
        {bodyShort}
      </p>
      {/* ארבעת השלבים — הדפוס של StoryHome: מילה לשלב, מספרים דקורטיביים
          (הסדר כבר במבנה הרשימה, ולכן מוסתרים מקורא מסך). בעמודה הצרה של
          הנייד הם נשברים לשתי שורות של שניים — ה-wrap הוא הפריסה, לא תקלה. */}
      <ol className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:mb-5 sm:gap-x-3.5 sm:gap-y-1">
        {steps.map((step, i) => (
          <li key={step} className="flex items-baseline gap-1 whitespace-nowrap">
            <span aria-hidden="true" className="font-display text-[8px] tracking-[0.16em] text-lapis-ink sm:text-[9px]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[10.5px] font-medium text-graphite sm:text-[13.5px]">{step}</span>
          </li>
        ))}
      </ol>
      {/* בנייד הכפתור נשבר לשתי שורות כשצריך — עמודה של 165px אינה מכילה
          "לתכנן לפי הדרישות שלי" בשורה, וקיצור הטקסט היה מחליש את הפעולה. */}
      <Link
        href={href}
        className="mt-auto w-full rounded-[2px] bg-graphite px-2 py-2.5 text-center text-[12.5px] font-semibold text-porcelain transition-colors hover:bg-graphite/90 sm:w-auto sm:px-8 sm:py-3.5 sm:text-[16px] sm:tracking-wide"
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
// **המסך הראשון בנייד: hero + שתי הדלתות, בלי גלילה.** הדלתות עומדות זו
// לצד זו גם בנייד — הבחירה היא השוואה, והשוואה עושים זה לצד זה. מכאן
// הקיצוצים: תת-הכותרת מוסתרת, הגוף מתקצר לגרסה הקצרה, והריפודים הדוקים.
// אותו עיקרון שהוחל על הוויטרינה של `/story` — `min-h` ולא `h`, כדי שמי
// שהגדילה גופן תקבל גלישה ולא חיתוך.
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
          {/* שתי עמודות גם בנייד: הבחירה היא ההשוואה, והשוואה עושים זה לצד
              זה. הדלתות שקופות, ולכן הגבול הוא קו מתאר אחד + קו הפרדה —
              לא רקע. */}
          <div className="relative grid grid-cols-2 border border-graphite/[0.14]">
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
              divider
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
