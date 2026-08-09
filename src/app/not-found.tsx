import Link from "next/link";
import { he } from "@/i18n/he";
import ArchBackground from "@/components/site/ArchBackground";

const s = he.site;

// זהו ה-not-found של השורש: הוא מרונדר מחוץ ל-(site)/layout ולכן אינו מקבל ממנו
// את ArchBackground. מאז שהגריד עבר מ-.ap-scope לשכבה הקבועה, הוא חייב לרנדר
// אותה בעצמו — אחרת העמוד נשאר פורצלן שטוח בלי הרקע של המותג.
export default function NotFound() {
  return (
    <div className="ap-scope relative flex min-h-full flex-col items-center justify-center px-6 py-24 text-center">
      <ArchBackground />
      {/* `<main>` ולא `<div>`: העמוד מרונדר מחוץ ל-(site)/layout ולכן אינו מקבל
          ממנו את ה-landmark, וכל תוכנו היה יושב מחוץ לכל landmark שהוא.
          `ap-surface` מאותה סיבה — הטקסט כאן נצבע ישירות מעל ArchBackground. */}
      <main className="ap-surface relative z-[2] flex flex-col items-center px-8 py-10 text-center">
        <span className="font-display text-6xl font-semibold text-lapis">404</span>
        <h1 className="mt-4 text-2xl font-semibold text-graphite">{s.notFoundTitle}</h1>
        <p className="mt-2 max-w-sm text-ink60">{s.notFoundBody}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-[2px] bg-graphite px-6 py-3 text-sm font-semibold text-porcelain transition-colors hover:bg-graphite/90"
          >
            {s.notFoundHome}
          </Link>
          <Link
            href="/design"
            className="rounded-[2px] border border-graphite px-6 py-3 text-sm font-medium text-graphite transition-colors hover:border-lapis hover:text-lapis"
          >
            {s.ctaStart}
          </Link>
        </div>
      </main>
    </div>
  );
}
