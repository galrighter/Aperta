import Link from "next/link";
import { story } from "@/i18n/story";
import { StoryShowcase } from "./StoryShowcase";

// story mode — דף הבית החלופי.
//
// **מה העמוד הזה חייב לעשות בתוך מסך אחד:** להעביר שהלקוחה אינה צריכה לדעת
// לעצב, שהיא מספרת משהו, שאנחנו מתרגמים לצורה, שהיא בוחרת, ושמה שנבחר הופך
// לתכשיט. לא להסביר AI, לא להסביר טכנולוגיה, ולא להפוך לדף מידע.
//
// **למה `min-h` ולא `h`.** גובה קשיח על 100svh פירושו שבטלפון קטן בלנדסקייפ,
// או אצל מי שהגדיל את הגופן, הטקסט נחתך — וזה הדבר היחיד כאן שאסור שיקרה. אז
// המבנה שואף למסך אחד ומרשה לעצמו לגלוש כשהתוכן לא נכנס: ההבטחה, ארבעת השלבים
// וה-CTA נשארים למעלה בכל מקרה, ומה שיורד מתחת לקו הוא הדוגמה — היחיד מביניהם
// שאפשר לגלות בגלילה קצרה.
//
// `--ap-header-h` נמדד ונכתב על ידי SiteHeader; הנפילה־לאחור היא לפני שהמדידה
// הראשונה רצה.
const s = story.home;

export function StoryHome() {
  return (
    // `overflow-x-clip` בגלל הצעיף: הוא גולש 30px מחוץ לעמודת התוכן ועוד כרוחב
    // הטשטוש, ובנייד זה עובר את קצה המסך. `clip` ולא `hidden` — האחרון יוצר מכל
    // גלילה, וזה היה שובר את ה-`sticky` של הכותרת.
    <section
      className="mx-auto flex max-w-[1240px] flex-col justify-center overflow-x-clip px-5 py-8 sm:px-10 sm:py-12"
      style={{ minHeight: "calc(100svh - var(--ap-header-h, 68px))" }}
    >
      <div className="grid items-center gap-8 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        {/* ההבטחה — בלי משטח כלל, כמו ההירו של דף הבית (`(site)/page.tsx`).
            שם הטקסט יושב ישירות על `ArchBackground`, וזה כל ההבדל הוויזואלי בין
            שני העמודים: `/` תוקן ב-§B1 על ידי הכהיית טוקני הטקסט ולא על ידי
            הוספת משטח, ולכן שמר על הגיאומטריה. `/story` משמש כדף בית בפועל
            ולכן הוא מיושר אליו.

            **המחיר, ואיך הוא שולם.** בלי משטח, הרקע מתחת למילה הוא מה שיצא
            מהצטברות הדקורציה באותה נקודה. הגרסה הראשונה של היישור השאירה כאן
            `lapis` ב-eyebrow ובמספרי השלבים, ושער ה-axe הפיל אותה: הטקסט נחת
            על קו קצה הלוח (#cbc6bd) ונתן 3.62. **זה לא היה מקרה רע — זה היה
            החישוב שנעשה מראש, שהתממש.**

            לכן כל טקסט קטן כאן נבחר כך שיעבור 4.5:1 מול אותו קו קצה, שהוא הרקע
            הכהה ביותר שהוא יכול לנחות עליו בפועל: `lapis-ink` (5.26) במקום
            `lapis` (3.62), ו-`ink80` (6.05) במקום `mist` (3.85). הבחירה נגזרת
            מהמדידה ולא ממה שהסורק במקרה סימן — `mist` בחצים לא נתפס באותה
            ריצה, והוא היה נופל באותה מידה אילו נחת שם.

            **מה שנשאר פתוח.** קו השיער הלאפיסי (0.55) והמעוין המלא נשארים
            מתחת לסף לכל טוקן חוץ מ-`graphite`, והם עדיין בעמוד. שום טקסט לא
            נוחת עליהם בשתי הרזולוציות שנסרקות, וזה אומר בדיוק מה שהוא אומר:
            מיקום, לא מבנה. סגירה אמיתית דורשת להוריד אותם ל-α≤0.39 — כלומר
            לרוקן את המעוין — או להזיז את הצמד מחוץ לעמודת הקריאה. שתיהן
            גלובליות ונוגעות בכחול של הלוגו, ולכן הן החלטה של אדם.

            **`max-md:pe-5`.** מסדרון בצד הסוף של השורה (בעברית — שמאל), בנייד
            בלבד. הוא מה שנותן למסילת הלאפיס מקום לעמוד בו: בלעדיו המעוין נדחק
            לקצה המסך ונחתך, כי האלכסון שלו (22.6px) רחב משולי העמוד (20px).
            עם המסדרון הטקסט נעצר ב-40px, והמעוין יושב במלואו באמצע שביניהם.
            הוא לא מקצר את השורה בפועל — בעברית הקצה השמאלי משונן ממילא, וכל
            מה שהוא משנה הוא היכן המילה גולשת. */}
        <div className="max-md:pe-5">
          <div className="mb-4 font-display text-[11px] tracking-[0.42em] text-lapis-ink sm:mb-6 sm:text-xs">
            {s.eyebrow}
          </div>
          <h1
            className="mb-4 text-[clamp(34px,8.5vw,64px)] font-semibold leading-[1.05] sm:mb-6"
            style={{ letterSpacing: "-1.5px", textWrap: "balance" }}
          >
            {s.titleLine1}
            <br />
            {s.titleLine2}
          </h1>
          <p
            className="mb-7 max-w-[460px] text-[16px] leading-relaxed text-ink80 sm:mb-9 sm:text-[19px]"
            style={{ textWrap: "pretty" }}
          >
            {s.lede}
          </p>

          {/* הפעולה הראשית. אחת, ובמשקל של אחת. */}
          <Link
            href="/story/create"
            className="inline-block rounded-[2px] bg-graphite px-9 py-4 text-[16px] font-semibold tracking-wide text-porcelain transition-colors hover:bg-graphite/90 sm:px-[42px] sm:py-[18px] sm:text-[17px]"
          >
            {s.cta}
          </Link>

          {/* ארבעת השלבים — מה יקרה אחרי הלחיצה, בלי פסקה.
              רשימה סדורה ולא ארבע תיבות: זה רצף, וקורא מסך צריך לשמוע אותו
              כרצף. המספרים דקורטיביים (הסדר כבר במבנה) ולכן מוסתרים ממנו. */}
          <ol className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-10 sm:gap-x-4">
            {s.steps.map((step, i) => (
              <li key={step.n} className="flex items-center gap-3 sm:gap-4">
                {i > 0 && (
                  <span aria-hidden="true" className="font-display text-[12px] text-ink80">
                    ←
                  </span>
                )}
                <span className="flex items-baseline gap-1.5">
                  <span aria-hidden="true" className="font-display text-[10px] tracking-[0.18em] text-lapis-ink">
                    {step.n}
                  </span>
                  <span className="text-[14px] font-medium text-graphite sm:text-[15px]">
                    {step.label}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* התרגום, כדוגמה. `min-w-0` כי הוויטרינה נושאת פסי SVG ברוחב מלא
            ועמודת גריד אינה מתכווצת מתחת לתוכן שלה בלי זה. */}
        <div className="relative min-w-0">
          {/* מסגרת לאפיס מוסטת — אותה שפה דקורטיבית של דף הבית הקיים.
              היא גלויה גם בנייד מאז שהכרטיס התמלא הוסר: קודם המילוי והמסגרת שלו
              היו מה שאמר "כאן דוגמה", ועכשיו זה תפקידה. ההיסט קטן יותר בנייד כדי
              שתישאר בתוך שולי העמוד. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-3 -left-3 h-full w-full border-[1.5px] border-lapis/40 sm:-top-4 sm:-left-4"
          />
          <StoryShowcase className="relative" />
        </div>
      </div>
    </section>
  );
}
