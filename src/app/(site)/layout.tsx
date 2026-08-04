import type { Metadata } from "next";
import { he } from "@/i18n/he";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import ArchBackground from "@/components/site/ArchBackground";
import DesignReadyWatch from "@/components/site/DesignReadyWatch";

const s = he.site;

export const metadata: Metadata = {
  title: s.titleHe,
  description: s.heroSubtitleSeo,
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ap-scope relative flex min-h-full flex-col">
      <ArchBackground />
      <SiteHeader />
      <main className="relative z-[2] flex-1">{children}</main>
      <SiteFooter />
      {/* חיווי "העיצוב מוכן" למי שיצאה מהמסך בזמן היצירה — בכל עמוד באתר. */}
      <DesignReadyWatch />
    </div>
  );
}
