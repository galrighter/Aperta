import Link from "next/link";
import { story } from "@/i18n/story";
import { StoryExamples } from "./StoryExamples";

// story mode — דף הבית החלופי.
//
// **מה העמוד הזה חייב לעשות בתוך מסך אחד:** להעביר שהלקוחה אינה צריכה לדעת
// לעצב, שהיא מספרת משהו, שאנחנו מתרגמים לצורה, שהיא בוחרת, ושמה שנבחר הופך
// לתכשיט. לא להסביר AI, לא להסביר טכנולוגיה, ולא להפוך לדף מידע.
//
// **למה `min-h` ולא `h`.** גובה קשיח על 100svh פירושו שבטלפון קטן בלנדסקייפ,
// או אצל מי שהגדיל את הגופן, הטקסט נחתך — וזה הדבר היחיד כאן שאסור שיקרה. אז
// המבנה שואף למסך אחד ומרשה לעצמו לגלוש כשהתוכן לא נכנס: ההבטחה, ארבעת השלבים
// וה-CTA נשארים למעלה בכל מקרה, ומה שיורד מתחת לקו הוא הדוגמה — היחיד מביניהם
// שאפשר לגלות בגלילה קצרה.
//
// `--ap-header-h` נמדד ונכתב על ידי SiteHeader; הנפילה־לאחור היא לפני שהמדידה
// הראשונה רצה.
const s = story.home;

export function StoryHome() {
  return (
    <section
      className="mx-auto flex max-w-[1240px] flex-col justify-center px-5 py-8 sm:px-10 sm:py-12"
      style={{ minHeight: "calc(100svh - var(--ap-header-h, 68px))" }}
    >
      <div className="grid items-center gap-8 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        {/* ההבטחה */}
        <div className="ap-surface">
          <div className="mb-4 font-display text-[11px] tracking-[0.42em] text-lapis sm:mb-6 sm:text-xs">
            {s.eyebrow}
          </div>
          <h1
            className="mb-4 text-[clamp(34px,8.5vw,64px)] font-semibold leading-[1.05] sm:mb-6"
            style={{ letterSpacing: "-1.5px", textWrap: "balance" }}
          >
            {s.titleLine1}
            <br />
            {s.titleLine2}
          </h1>
          <p
            className="mb-7 max-w-[460px] text-[16px] leading-relaxed text-ink80 sm:mb-9 sm:text-[19px]"
            style={{ textWrap: "pretty" }}
          >
            {s.lede}
          </p>

          {/* הפעולה הראשית. אחת, ובמשקל של אחת. */}
          <Link
            href="/story/create"
            className="inline-block rounded-[2px] bg-graphite px-9 py-4 text-[16px] font-semibold tracking-wide text-porcelain transition-colors hover:bg-graphite/90 sm:px-[42px] sm:py-[18px] sm:text-[17px]"
          >
            {s.cta}
          </Link>

          {/* ארבעת השלבים — מה יקרה אחרי הלחיצה, בלי פסקה.
              רשימה סדורה ולא ארבע תיבות: זה רצף, וקורא מסך צריך לשמוע אותו
              כרצף. המספרים דקורטיביים (הסדר כבר במבנה) ולכן מוסתרים ממנו. */}
          <ol className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-10 sm:gap-x-4">
            {s.steps.map((step, i) => (
              <li key={step.n} className="flex items-center gap-3 sm:gap-4">
                {i > 0 && (
                  <span aria-hidden="true" className="font-display text-[12px] text-mist">
                    ←
                  </span>
                )}
                <span className="flex items-baseline gap-1.5">
                  <span aria-hidden="true" className="font-display text-[10px] tracking-[0.18em] text-lapis">
                    {step.n}
                  </span>
                  <span className="text-[14px] font-medium text-graphite sm:text-[15px]">
                    {step.label}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* התרגום, כדוגמה */}
        <div className="relative">
          {/* מסגרת לאפיס מוסטת — אותה שפה דקורטיבית של דף הבית הקיים */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-4 -left-4 hidden h-full w-full border-[1.5px] border-lapis/40 sm:block"
          />
          <StoryExamples className="relative" />
          <p className="mt-3 text-center font-display text-[11px] tracking-[0.14em] text-mist">
            {s.examplesHint}
          </p>
        </div>
      </div>
    </section>
  );
}
