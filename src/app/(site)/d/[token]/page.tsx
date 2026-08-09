import { cache } from "react";
import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";
import { designCode } from "@/lib/designCode";
import { isShareToken } from "@/lib/shareToken";
import { shareImageUrl } from "@/lib/shareImageUrl";
import { bumpShareViews, getShareByToken, type ShareRow } from "@/lib/db/shares";
import { countCuts, cutoutsInner, mmLabel } from "@/components/create/model";
import SharedPiece from "@/components/share/SharedPiece";

/**
 * דף נחיתה לעיצוב אחד — מה שנפתח מלינק השיתוף.
 *
 * **נתיב אחד, לא עמוד לכל עיצוב.** כל טוקן הוא כתובת נפרדת ודף נפרד לכל דבר,
 * אבל התבנית אחת ונטענת מהמסד. עמוד סטטי לכל שיתוף היה מחייב build מחדש לכל
 * לחיצה על "שיתוף".
 *
 * **noindex, follow.** ראו docs/SHARING.md: הלינקים האלה נשלחים בהודעות פרטיות
 * שגוגל אינה זוחלת, כך שאין כאן ערך קידום שהולך לאיבוד; מה שכן היה נוצר הוא
 * מאות עמודים כמעט זהים — אותו טקסט שיווקי, תמונה אחרת — שמדללים את העמודים
 * האמיתיים. `follow` נשאר כדי שכל לינק שכן נזחל יעביר הלאה.
 */

const t = he.share;

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * `generateMetadata` והעמוד עצמו רצים שניהם על אותה בקשה וצריכים את אותה
 * שורה. `cache` מ-React מצמיד אותם לשאילתה אחת — בלעדיו כל צפייה בדף הייתה
 * שתי פניות זהות למסד.
 *
 * בדיקת הצורה קודמת לפנייה: `/d/<כל דבר>` הוא נתיב שסורקים מגיעים אליו.
 */
const loadShare = cache(async (token: string): Promise<ShareRow | null> => {
  if (!isShareToken(token)) return null;
  return getShareByToken(token).catch(() => null);
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) return { robots: { index: false, follow: true } };

  const code = designCode(share.serial);
  const name = share.product_type === "ring" ? t.titleRing : t.titleBracelet;
  const title = `${name}${code ? ` ${code}` : ""} — ${he.site.brand}`;
  const url = `${SITE.url}/d/${share.token}`;
  // תמונת השיתוף — הצילום אם יש, אחרת ההדמיה של המודל, אחרת תמונת ברירת המחדל
  // של האתר (app/opengraph-image). כתובת מוחלטת: זחלני התצוגה המקדימה של
  // וואטסאפ/טלגרם אינם פותרים נתיב יחסי. ה-`?v=` הוא מה שמאפשר לשיתוף חוזר
  // להחליף תמונה בכתובת שמוגשת `immutable` — ראו `lib/shareImageUrl`.
  //
  // **בלי `width`/`height`.** הקנבס של מודל התמונה הוא 1536x1024 או 1024x1536
  // לפי צורת הפריט (ראו docs/OPS_PORTRAIT_CANVAS.md), ואיזה מהם — לא כתוב
  // בשורה. מידות מוצהרות שגויות גרועות ממידות חסרות: חלק מהזחלנים פורסים
  // לפיהן לפני שהתמונה ירדה, וריבוע מוצהר על תמונה רחבה נחתך. בלעדיהן הם
  // מודדים את מה שהורידו.
  const image = shareImageUrl(SITE.url, share.token, share) ?? undefined;

  return {
    title,
    description: t.subtitle,
    alternates: { canonical: url },
    robots: { index: false, follow: true },
    openGraph: {
      type: "article",
      locale: "he_IL",
      siteName: he.site.brand,
      title,
      description: t.subtitle,
      url,
      ...(image ? { images: [{ url: image, alt: name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t.subtitle,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function SharePage({ params }: Params) {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) notFound();

  // ספירת צפייה, אחרי שהתשובה נשלחה. `after` ולא הפעלה משוחררת: ב-Worker
  // ההרצה נגמרת עם התשובה, ופעולה שלא הוכרזה נחתכת באמצע חלק מהזמן.
  after(() => bumpShareViews(share.id));

  const code = designCode(share.serial);
  const name = share.product_type === "ring" ? t.titleRing : t.titleBracelet;
  const cutouts = cutoutsInner(share.svg);

  return (
    <div className="ap-surface mx-auto max-w-[1200px] px-5 py-12 sm:px-10">
      <div className="mb-3 font-display text-xs tracking-[0.22em] text-mist">{t.eyebrow}</div>
      <h1 className="mb-2 text-[30px] font-semibold tracking-tight text-graphite sm:text-[38px]">
        {name}
      </h1>
      {code && (
        <p className="mt-2 font-display text-[12px] tracking-[0.14em] text-mist">
          {t.codeLabel} <span className="text-lapis" dir="ltr">{code}</span>
        </p>
      )}
      <p className="mt-4 max-w-[620px] text-[15px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
        {t.subtitle}
      </p>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.5fr_1fr]">
        {/* ===== התכשיט ===== */}
        <SharedPiece
          material={share.material}
          cutouts={cutouts}
          lengthMm={Number(share.length_mm)}
          widthMm={Number(share.width_mm)}
          gapMm={Number(share.gap_mm)}
          thicknessMm={Number(share.thickness_mm)}
        />

        {/* ===== מפרט והפעולות ===== */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-[104px]">
          <div className="border border-graphite/10 bg-white p-6">
            <div className="mb-4 font-display text-xs tracking-[0.15em] text-mist">{t.specTitle}</div>
            <Row k={t.specProduct} v={share.product_type === "ring" ? he.ring : he.bracelet} />
            <Row k={t.specWidth} v={`${mmLabel(Number(share.width_mm))} ${he.design.mm}`} />
            <Row k={t.specLength} v={`${mmLabel(Number(share.length_mm))} ${he.design.mm}`} />
            <Row k={t.specCuts} v={String(countCuts(share.svg))} />
            <Row k={t.specMaterial} v={t.specMaterialVal} />
          </div>

          {/* שתי הפעולות. "להזמין כזה" הוא הראשי — מי שהגיע מלינק ראה משהו
              ספציפי, וזה מה שהוא בא בשבילו. */}
          <div className="flex flex-col gap-3">
            <div>
              <Link
                href={`/design?from=${share.token}`}
                className="block rounded-[2px] bg-graphite px-[34px] py-3.5 text-center text-base font-semibold text-porcelain transition-colors hover:bg-graphite/90"
              >
                {t.ctaOrder}
              </Link>
              <p className="mt-1.5 text-center text-[13px] text-ink60">{t.ctaOrderNote}</p>
            </div>
            <div>
              <Link
                href="/design"
                className="block rounded-[2px] border border-graphite px-[34px] py-3.5 text-center text-base font-medium text-graphite transition-colors hover:border-lapis hover:text-lapis"
              >
                {t.ctaOwn}
              </Link>
              <p className="mt-1.5 text-center text-[13px] text-ink60">{t.ctaOwnNote}</p>
            </div>
            <p className="text-center text-[13px] text-mist">{t.priceNote}</p>
          </div>
        </div>
      </div>

      {/* ===== מי אנחנו ===== */}
      <section className="mt-16 border-t border-graphite/10 pt-12">
        <div className="mb-3 font-display text-xs tracking-[0.22em] text-mist">{t.aboutTitle}</div>
        <p className="max-w-[720px] text-[15px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {t.aboutBody}
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            [t.aboutPoint1Title, t.aboutPoint1Body],
            [t.aboutPoint2Title, t.aboutPoint2Body],
            [t.aboutPoint3Title, t.aboutPoint3Body],
          ].map(([title, body]) => (
            <div key={title} className="border border-graphite/10 bg-white p-6">
              <h2 className="text-base font-semibold text-graphite">{title}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink60">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-graphite/[0.07] py-2.5 text-sm last:border-b-0">
      <span className="text-ink60">{k}</span>
      <span className="font-semibold text-graphite">{v}</span>
    </div>
  );
}
