import Link from "next/link";
import { he } from "@/i18n/he";
import RunsLog from "@/components/admin/RunsLog";

// יומן היצירות בתוך הפורטל. אותו רכיב שמוצג במעבדה (`/debug`) — כאן בלי טופס
// ההרצה, כי מי שנכנס לניהול בא לראות מה קרה ולא להריץ עוד יצירה.
export default function AdminRunsPage() {
  return (
    <div dir="rtl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-graphite">{he.site.adminNavRuns}</h1>
          <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-ink60">
            {he.site.adminCardRunsDesc}
          </p>
        </div>
        <Link href="/debug" className="text-[13px] text-lapis hover:underline">
          {he.site.adminNavLab} ←
        </Link>
      </div>
      <RunsLog />
    </div>
  );
}
