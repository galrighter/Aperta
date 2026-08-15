import type { Metadata } from "next";
import { he } from "@/i18n/he";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import ArchBackground from "@/components/site/ArchBackground";
import DesignReadyWatch from "@/components/site/DesignReadyWatch";
import PageViewTracker from "@/components/site/PageViewTracker";

const s = he.site;

export const metadata: Metadata = {
  title: s.titleHe,
  description: s.heroSubtitleSeo,
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ap-scope relative flex min-h-full flex-col">
      {/* קישור דילוג. הוא הילד הראשון בעץ ולכן היעד הראשון של Tab, ומוסתר עד
          שהוא מקבל מיקוד — כלומר בעכבר הוא אינו קיים. בלעדיו הגעה לתוכן דורשת
          תשע לחיצות Tab דרך הלוגו וכל שורת הניווט, בכל עמוד מחדש.
          `sr-only` בלבד לא מספיק: הקישור צריך להיראות ברגע שקופצים עליו. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:right-3 focus:z-50 focus:rounded-[2px] focus:bg-graphite focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-porcelain"
      >
        {s.skipToContent}
      </a>
      <ArchBackground />
      <SiteHeader />
      {/* `tabIndex={-1}` כדי שהדילוג באמת יעביר את המיקוד לכאן ולא רק יגלול:
          אלמנט שאינו ממוקד-מטבעו מתעלם מ-`href="#main"` מבחינת מיקוד, והקורא
          ממשיך מהמקום שבו היה. */}
      <main id="main" tabIndex={-1} className="relative z-[2] flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
      {/* חיווי "העיצוב מוכן" למי שיצאה מהמסך בזמן היצירה — בכל עמוד באתר. */}
      <DesignReadyWatch />
      {/* ‏page_view — ראש המשפך. ראו lib/client/track.ts. */}
      <PageViewTracker />
    </div>
  );
}
