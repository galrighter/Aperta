import Link from "next/link";
import { he } from "@/i18n/he";
import ArchBackground from "@/components/site/ArchBackground";

const s = he.site;

// זהו ה-not-found של השורש: הוא מרונדר מחוץ ל-(site)/layout ולכן אינו מקבל ממנו
// את ArchBackground. מאז שהגריד עבר מ-.rm-scope לשכבה הקבועה, הוא חייב לרנדר
// אותה בעצמו — אחרת העמוד נשאר פורצלן שטוח בלי הרקע של המותג.
export default function NotFound() {
  return (
    <div className="rm-scope relative flex min-h-full flex-col items-center justify-center px-6 py-24 text-center">
      <ArchBackground />
      <div className="relative z-[2] flex flex-col items-center">
        <span className="font-display text-6xl font-semibold text-cobalt">404</span>
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
            className="rounded-[2px] border border-graphite px-6 py-3 text-sm font-medium text-graphite transition-colors hover:border-cobalt hover:text-cobalt"
          >
            {s.ctaStart}
          </Link>
        </div>
      </div>
    </div>
  );
}
