import { he } from "@/i18n/he";

const s = he.site;

/**
 * רצועת המניפסט — החתימה של דפי הבית.
 *
 * חולצה מ-`(site)/page.tsx` כשדף הבית התפצל לשניים: הצומת החדש ב-`/` ודף
 * הנחיתה הישן ב-`/design-yours` סוגרים שניהם באותה רצועה, והמשפט נכון לשני
 * המסלולים באותה מידה.
 */
export function ManifestoStrip() {
  return (
    // הרצועה אטומה ולא `/55`: שקיפות פירושה שהרקע בפועל הוא הצירוף של הלוח
    // הדקורטיבי עם מה שמתחתיו באותה נקודה, כלומר ערך שמשתנה עם הגלילה. כאן
    // הוא טוקן משטח ידוע, וחוזה הניגודיות ב-globals.css חל עליו.
    <section className="relative z-[1] border-y border-graphite/10 bg-porcelain-slab">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 px-5 py-9 sm:px-10">
        <p className="text-[24px] font-light text-graphite" style={{ textWrap: "balance" }}>
          {s.manifestoLine}
        </p>
        <div className="flex items-center gap-3 font-display text-[11px] tracking-[0.2em] text-ink60">
          <span className="border border-graphite/15 px-3 py-1.5">{s.manifestoTag1}</span>
          <span className="border border-graphite/15 px-3 py-1.5">{s.manifestoTag2}</span>
        </div>
      </div>
    </section>
  );
}
