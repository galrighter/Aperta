import type { Metadata } from "next";
import Link from "next/link";
import { he } from "@/i18n/he";
import AdminShell from "@/components/admin/AdminShell";
import BrandMark from "@/components/site/BrandMark";

export const metadata: Metadata = {
  title: `${he.site.adminTitle} — ${he.site.brand}`,
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="border-b border-graphite/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2.5">
            {/* הסימן לבדו: בשורת ניהול צרה אין מקום לנעילה, ובדיוק בשביל זה
                הסימן עומד לבדו. */}
            <BrandMark size={22} title={he.site.brand} />
            <span className="text-xs text-mist">{he.site.adminTitle}</span>
          </Link>
          <Link href="/" className="text-xs text-ink60 hover:text-graphite">
            {he.site.navHome}
          </Link>
        </div>
      </header>
      {/* השער והניווט יושבים כאן ולא בכל עמוד: עמוד ניהול חדש מוגן בזכות
          המקום שבו הוא נמצא, ולא בזכות מי שזכר לעטוף אותו. */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <AdminShell>{children}</AdminShell>
      </main>
    </div>
  );
}
