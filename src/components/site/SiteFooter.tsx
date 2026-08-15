import Link from "next/link";
import { he } from "@/i18n/he";
import { NAV, SITE, businessIdentified, businessLines, whatsappUrl } from "@/lib/site.config";
import BrandLockup from "./Wordmark";

const s = he.site;

export default function SiteFooter() {
  const wa = whatsappUrl(s.whatsappPrefill);
  return (
    <footer className="relative z-[2] mt-24 border-t border-graphite/10">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-xs">
            {/* בפוטר יש מקום לנעילה המלאה — הסימן מעל השם, ומתחתיו DESIGNS. */}
            <BrandLockup height={44} stacked withSub align="right" title={s.brand} />
            {/* bdi ולא dir="ltr": ראו הנימוק אצל כתובת האימייל למטה — dir היה
                מיישר את השורה שמאלה בעוד שאר העמודה ימנית. */}
            <p className="mt-4 text-sm text-mist"><bdi>{s.tagline}</bdi></p>
          </div>

          <nav aria-label={s.navFooterLabel} className="flex flex-col gap-2.5 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink60 transition-colors hover:text-lapis"
              >
                {s[item.key]}
              </Link>
            ))}
            {/* `/design-rules` יושב כאן ולא בניווט העליון: הוא מדריך ולא שלב
                במסע, אבל בלי הקישור הזה לא היה אליו שום מסלול מדף הבית — רק
                מסכים בתוך המשפך, שנוצרים אחרי ניסיון יצירה. */}
            <Link
              href="/design-rules"
              className="text-ink60 transition-colors hover:text-lapis"
            >
              {s.navDesignRules}
            </Link>
            {/* bdi ולא dir="ltr": dir על האלמנט הופך גם את text-align:start שלו,
                והמייל היה נצמד לשמאל בזמן ששאר העמודה ימנית. bdi מבודד את
                הכיווניות של הטקסט בלבד ומשאיר את היישור של העמודה. */}
            <a
              href={`mailto:${SITE.contactEmail}`}
              className="text-ink60 transition-colors hover:text-lapis"
            >
              <bdi>{SITE.contactEmail}</bdi>
            </a>
            {/* וואטסאפ — ערוץ ההמרה הזול ביותר בקהל ישראלי-מובייל, וערוץ
                ההרגעה הטבעי כל עוד אין סליקה באתר. מוצג רק כשיש מספר. */}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink60 transition-colors hover:text-lapis"
              >
                {s.contactWhatsapp}
              </a>
            )}
            {SITE.business.phone && (
              <a
                href={`tel:${SITE.business.phone}`}
                className="text-ink60 transition-colors hover:text-lapis"
              >
                <bdi>{SITE.business.phone}</bdi>
              </a>
            )}
          </nav>

          <nav aria-label={s.navLegalLabel} className="flex flex-col gap-2.5 text-sm">
            <span className="text-xs font-medium tracking-wide text-mist">{s.footerLegal}</span>
            {/* הצהרת הנגישות ראשונה בעמודה, מעל התנאים: מי שמחפש אותה בדרך כלל
                כבר נתקל במשהו שלא עבד, ותקנה 35ה דורשת שהיא תהיה "זמינה". */}
            <Link href="/accessibility" className="text-ink60 transition-colors hover:text-lapis">
              {s.navAccessibility}
            </Link>
            <Link href="/terms" className="text-ink60 transition-colors hover:text-lapis">
              {s.navTerms}
            </Link>
            <Link href="/privacy" className="text-ink60 transition-colors hover:text-lapis">
              {s.navPrivacy}
            </Link>
            {/* התחזוקה יושבת כאן ולא בניווט העליון: היא נדרשת אחרי הקנייה, לא
                לפניה, והיא הצד השני של סעיף האחריות בתנאי השימוש. */}
            <Link href="/care" className="text-ink60 transition-colors hover:text-lapis">
              {s.navCare}
            </Link>
          </nav>
        </div>

        {/* זהות העוסק בפוטר, בכל עמוד. חוק הגנת הצרכן דורש שהיא תימסר לפני
            העסקה, ולא רק בעמוד שצריך לחפש — וזה גם חסם האמון הזול ביותר
            לתיקון (docs/FULL_AUDIT_2026-08.md, פרק 4, ממצא R1). כשהפרטים
            עוד לא הוגדרו השורה פשוט אינה מוצגת, ו-/terms אומר שהם בהשלמה. */}
        {businessIdentified() && (
          <p className="mt-10 text-[12px] text-mist">{businessLines().join(" · ")}</p>
        )}

        <div className="mt-12 flex flex-col gap-2 border-t border-graphite/10 pt-6 text-[13px] text-mist sm:flex-row sm:items-center sm:justify-between">
          <span><bdi>{s.footerTagline}</bdi></span>
          <span className="font-display tracking-[0.15em]">{s.footerCopyright}</span>
        </div>
      </div>
    </footer>
  );
}
