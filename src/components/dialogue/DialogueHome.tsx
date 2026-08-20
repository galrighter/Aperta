import Link from "next/link";
import { dialogue } from "@/i18n/dialogue";
import { StoryShowcase } from "@/components/story/StoryShowcase";

// dialogue mode — דף הבית החלופי (A2), בתבנית `StoryHome` ומאותם נימוקים:
// מסך אחד שאומר שמתחילים בשיחה, שמסכימים על הכיוון לפני שרואים אותו, ושמה
// שנבחר נחתך באמת. בלי להסביר AI ובלי להפוך לדף מידע.
//
// הוויטרינה היא `StoryShowcase` הקיימת — עיצובים אמיתיים מהסטודיו — בכוונה
// ולא עותק: היא מציגה בדיוק את מה שהמסלול הזה מבטיח (צורות שנחתכות), והיא
// הצרכן הקיים היחיד של המאגר עד שהגלריה המאוצרת (‏PROMPT_SPEC §3.2) תיבנה.
// שיקולי הנגישות והרקע מתועדים שם ואינם משוכפלים לכאן.
const s = dialogue.home;

export function DialogueHome() {
  return (
    <section
      className="mx-auto flex max-w-[1240px] flex-col justify-center overflow-x-clip px-5 py-5 sm:px-10 sm:py-10"
      style={{ minHeight: "calc(100svh - var(--ap-header-h, 68px))" }}
    >
      <div className="grid items-center gap-5 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        <div className="max-md:pe-5">
          <div className="mb-3 font-display text-[11px] tracking-[0.42em] text-lapis-ink sm:mb-5 sm:text-xs">
            {s.eyebrow}
          </div>
          <h1
            className="mb-3 text-[clamp(34px,8.5vw,64px)] font-semibold leading-[1.05] sm:mb-5"
            style={{ letterSpacing: "-1.5px", textWrap: "balance" }}
          >
            {s.titleLine1}
            <br />
            {s.titleLine2}
          </h1>
          <p
            className="mb-5 max-w-[460px] text-[16px] leading-relaxed text-ink80 sm:mb-8 sm:text-[19px]"
            style={{ textWrap: "pretty" }}
          >
            {s.lede}
          </p>

          <Link
            href="/dialogue/create"
            className="inline-block rounded-[2px] bg-graphite px-7 py-3 text-[16px] font-semibold tracking-wide text-porcelain transition-colors hover:bg-graphite/90 sm:px-9 sm:py-3.5 sm:text-[17px]"
          >
            {s.cta}
          </Link>

          <ol className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 sm:mt-8 sm:gap-x-6">
            {s.steps.map((step) => (
              <li key={step.n} className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span aria-hidden="true" className="font-display text-[10px] tracking-[0.18em] text-lapis-ink">
                  {step.n}
                </span>
                <span className="text-[14px] font-medium text-graphite sm:text-[15px]">
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative min-w-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-3 -left-3 h-full w-full border-[1.5px] border-lapis/40 sm:-top-4 sm:-left-4"
          />
          <StoryShowcase className="relative" />
        </div>
      </div>
    </section>
  );
}
