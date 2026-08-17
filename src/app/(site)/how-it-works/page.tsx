import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";

const s = he.site;

export const metadata: Metadata = {
  title: `${s.howTitle} — ${s.brand}`,
  description: s.howSubtitle,
  alternates: { canonical: "/how-it-works" },
};

// בלי איורי הצמידים: הם היו דוגמת ניקוב מיוצרת ולא מוצר, והלקוחות קראו אותם
// כתמונה של פריט אמיתי. הטקסט של השלב מסביר את השלב בלי המחשה מטעה.
//
// שלושה שלבים, ולשלב הראשון שלושה מסלולים מקבילים. הסדר הישן ("מתארים" ואז
// "הבינה מציירת") תיאר את העורך בלבד — מי שהגיע עם סיפור או עם קובץ מוכן לא
// מצא את עצמו בדף. המסלולים מוצגים כשלוש דלתות שוות בתוך שלב 1.
const STEPS: { t: string; b: string; tracks?: readonly { n: string; title: string; body: string }[] }[] = [
  { t: s.step1Title, b: s.step1Body, tracks: s.step1Tracks },
  { t: s.step2Title, b: s.step2Body },
  { t: s.step3Title, b: s.step3Body },
];

export default function HowItWorksPage() {
  return (
    <div className="ap-surface mx-auto max-w-4xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {s.howTitle}
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-ink60">{s.howSubtitle}</p>

      <ol className="mt-12 flex flex-col gap-10">
        {STEPS.map((step, i) => (
          <li key={i} className="grid items-start gap-6 sm:grid-cols-[auto_1fr] sm:gap-8">
            <div className="flex items-center gap-4 sm:flex-col sm:items-start">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-graphite font-display text-lg font-semibold text-porcelain">
                {i + 1}
              </span>
            </div>
            <div className="border border-graphite/10 bg-chalk p-6">
              <h2 className="text-xl font-semibold text-graphite">{step.t}</h2>
              <p className="mt-2 leading-relaxed text-ink60">{step.b}</p>
              {step.tracks && (
                <ul className="mt-5 grid gap-4 sm:grid-cols-3">
                  {step.tracks.map((track) => (
                    <li key={track.n} className="border border-graphite/10 bg-porcelain p-4">
                      <span className="font-display text-[11px] font-semibold tracking-[0.12em] text-ink60">
                        {track.n}
                      </span>
                      <h3 className="mt-1 font-semibold text-graphite">{track.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink60">{track.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* מסלול הזחילה היחיד אל `/design-rules` שאינו עובר בתוך המשפך. */}
      <p className="mt-10 text-sm leading-relaxed text-ink60">
        {s.howRulesLead}{" "}
        <Link href="/design-rules" className="font-medium text-lapis hover:underline">
          {s.howRulesLink}
        </Link>
        {s.howRulesEnd}
      </p>

      <div className="mt-14 text-center">
        <Link
          href="/design"
          className="inline-block rounded-[2px] bg-graphite px-8 py-3.5 text-sm font-semibold text-porcelain transition-colors hover:bg-graphite/90"
        >
          {s.heroCtaPrimary}
        </Link>
      </div>
    </div>
  );
}
