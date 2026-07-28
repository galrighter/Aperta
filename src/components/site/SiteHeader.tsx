"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { he } from "@/i18n/he";
import { NAV } from "@/lib/site.config";
import BrandMark from "./BrandMark";

const s = he.site;

// טיפול ה-CTA זהה בדסקטופ ובמובייל. קודם הדסקטופ קיבל כפתור מתאר והמובייל
// כפתור מלא — אותה פעולה בשני משקלים היררכיים שונים.
const CTA_CLASS =
  "rounded-[2px] border border-graphite px-4 py-1.5 font-medium text-graphite transition-colors hover:border-cobalt hover:text-cobalt";

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuId = useId();
  const ref = useRef<HTMLElement>(null);

  // גובה הכותרת נמדד ונכתב כמשתנה CSS, כדי שסרגל דביק אחר (סרגל השלבים במסע
  // היצירה) ייעצר מתחתיה ולא מאחוריה. הגובה משתנה לפי מסך ולפי גופן, ולכן הוא
  // נמדד ולא נכתב כמספר.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = () =>
      document.documentElement.style.setProperty("--rm-header-h", `${el.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // סגירה במעבר עמוד — לא להסתמך על onClick בלבד (ניווט אחורה/קדימה בדפדפן).
  useEffect(() => setOpen(false), [pathname]);

  // Escape סוגר את התפריט — ציפייה בסיסית מכל תפריט נפתח.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const links = NAV.map((item) => {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={`cursor-pointer transition-colors ${
          active ? "text-cobalt" : "text-graphite hover:text-cobalt"
        }`}
        aria-current={active ? "page" : undefined}
      >
        {s[item.key]}
      </Link>
    );
  });

  return (
    <header
      ref={ref}
      className="sticky top-0 z-20 border-b border-graphite/10 bg-porcelain/85 backdrop-blur-md"
    >
      <nav className="flex items-center justify-between px-5 py-5 sm:px-10">
        {/* לוגו */}
        <Link href="/" className="flex items-center gap-3.5" onClick={() => setOpen(false)}>
          <BrandMark size={38} />
          <span className="whitespace-nowrap font-display text-[15px] font-semibold tracking-[0.25em] text-graphite">
            {s.brand}
          </span>
        </Link>

        {/* ניווט דסקטופ */}
        <div className="hidden items-center gap-7 text-sm md:flex">
          {links}
          <Link href="/design" className={CTA_CLASS}>
            {s.ctaStart}
          </Link>
        </div>

        {/* כפתור תפריט מובייל */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? s.closeMenu : s.openMenu}
          aria-expanded={open}
          aria-controls={menuId}
          className="flex h-10 w-10 items-center justify-center rounded-[2px] text-graphite hover:bg-graphite/5 md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {/* תפריט מובייל נפתח */}
      {open && (
        <div id={menuId} className="border-t border-graphite/10 bg-porcelain md:hidden">
          <div className="flex flex-col items-start gap-4 px-5 py-4 text-base sm:px-10">
            {links}
            <Link href="/design" onClick={() => setOpen(false)} className={CTA_CLASS}>
              {s.ctaStart}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
