import type { Metadata } from "next";
import { he } from "@/i18n/he";

/**
 * השכבה השלישית של חסימת האינדוקס ל-`/studio` — לצד `robots.ts` (בקשה לזחלן
 * לפני הזחילה) ו-`middleware.ts` (כותרת על כל תגובה). כאן זה `<meta robots>`
 * בתוך ה-HTML עצמו, בדיוק כפי ש-`app/admin/layout.tsx` עושה.
 *
 * למה layout ולא `export const metadata` בעמוד: `studio/page.tsx` הוא
 * `"use client"`, ו-Next אינו מאפשר ייצוא `metadata` מקומפוננטת לקוח. ה-layout
 * הוא רכיב שרת שמחזיר את הילדים כמו שהם — אפס שינוי התנהגותי, ומכאן והלאה גם
 * עמוד חדש שייכנס תחת `/studio` יורש את החסימה במקום להיזכר בה.
 *
 * ה-`title` הייעודי סוגר את החצי השני של אותה בעיה: העמוד נשא את הכותרת ואת
 * התיאור של דף הבית מילה במילה.
 */
export const metadata: Metadata = {
  title: `${he.site.studioTitle} — ${he.site.brand}`,
  description: he.site.studioDescription,
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
