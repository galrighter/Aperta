"use client";

// המסגרת של פורטל הניהול: שער אחד, ניווט אחד, יציאה אחת — לכל עמודי `/admin`.
//
// עד עכשיו האדמין היה עמוד אחד עם לשוניות ב-state, ולכן לא היה אפשר לשלוח
// קישור ל"הזמנות" ולא לחזור אחורה בדפדפן. הלשוניות הפכו לכתובות, והשער עלה
// ל-layout: כל עמוד חדש תחת `/admin` מוגן בלי לזכור להוסיף לו עטיפה.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { he } from "@/i18n/he";
import { AdminGate } from "./AdminGate";

const s = he.site;

/** פריטי הניווט. `/debug` הוא חלק מהפורטל אף שהוא יושב מחוץ ל-`/admin`. */
const NAV = [
  { href: "/admin", label: s.adminNavHome },
  { href: "/admin/orders", label: s.adminTabOrders },
  { href: "/admin/inquiries", label: s.adminTabInquiries },
  { href: "/admin/designs", label: s.adminTabDesigns },
  { href: "/admin/runs", label: s.adminNavRuns },
  { href: "/debug", label: s.adminNavLab },
] as const;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <AdminNav />
      {children}
    </AdminGate>
  );
}

function AdminNav() {
  const pathname = usePathname();

  async function onLogout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    // רענון ולא ניקוי state: השער יושב מעל כל העמוד, וטעינה מחדש היא הדרך
    // הקצרה להחזיר אותו למסך הכניסה בלי שני מקורות אמת למי מחובר.
    window.location.assign("/admin");
  }

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-graphite/10">
      <nav aria-label={s.adminHomeTitle} className="flex flex-wrap gap-5">
        {NAV.map((item) => {
          // `/admin` פעיל רק בהתאמה מדויקת, אחרת הוא נדלק בכל תת-עמוד.
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${
                active
                  ? "border-b-graphite font-semibold text-graphite"
                  : "border-b-transparent text-ink60 hover:text-graphite"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button onClick={() => void onLogout()} className="pb-2.5 text-sm text-ink60 hover:text-graphite">
        {s.adminLogout}
      </button>
    </div>
  );
}

/**
 * מה עושים כשמסלול מחזיר 401/503 באמצע סשן.
 *
 * טעינה מחדש ולא הודעה במקום: השער יושב ב-layout, ואחרי רענון הוא זה שיחליט
 * אם להציג טופס כניסה או את ההודעה ש-ADMIN_TOKEN חסר. שני מקומות שמחליטים
 * את זה בנפרד הם שני מקומות שמתחזקים בנפרד.
 */
export const reloadOnAuthLost = () => window.location.reload();
