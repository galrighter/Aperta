"use client";

// מסך הפתיחה של עיצוב שנפתח מכתובת — `/design?resume=<id>`.
//
// למה הוא קיים: הקישור לעיצוב שיוצא במייל ("לצפייה בעיצוב", "להמשיך את
// העיצוב") נוחת על המשפך, והמשפך מתחיל תמיד במסך בחירת המוצר. שליפת העיצוב
// מהשרת (הגרסאות, והוולידציה שמזינה את ההדמיה) לוקחת כמה שניות, ובזמן הזה
// הלקוחה שלחצה על הקישור ראתה "מה נעצב?" עם שני מוצרים לבחירה — לא מסך המתנה
// אלא תחילת מסע חדש, לחיץ במלואו. לחיצה אחת שם מחליפה מוצר ומאפסת מידות, ואז
// העיצוב שנשלף נוחת על מצב שכבר השתנה.
//
// מה שהוא מראה הוא מה שאנחנו יודעים בוודאות: שהעיצוב הזה נפתח עכשיו, ומספרו.
// המספר הוא אותו מספר שכתוב במייל, וזו האמירה שהקישור הוביל למקום הנכון.
import { he } from "@/i18n/he";
import { Eyebrow, ScreenTitle } from "./ui";

const d = he.design;

export function OpeningScreen({ code }: { code: string | null }) {
  return (
    // `role="status"` — למי שאינו רואה את הפס, זה ההבדל בין המתנה לבין עמוד ריק.
    <section
      className="mx-auto max-w-[1200px] px-5 py-12 sm:px-10"
      role="status"
      aria-live="polite"
    >
      <Eyebrow>{d.openingEyebrow}</Eyebrow>
      <ScreenTitle>{d.openingTitle}</ScreenTitle>
      {code && (
        <p className="mt-2 font-display text-[12px] tracking-[0.14em] text-mist">
          {d.codeLabel}{" "}
          {/* הקוד לטיני ונקרא משמאל לימין, כמו בכל מקום אחר שבו הוא מוצג. */}
          <span className="text-lapis" dir="ltr">{code}</span>
        </p>
      )}
      <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
        {d.openingNote}
      </p>

      <div className="ap-sweep mt-8 h-[3px] w-full max-w-[560px] bg-graphite/12" />

      {/* שלד המסך שבדרך, בגובה של תיבת ההדמיה. לא קישוט: בלעדיו העמוד מתרוקן
          לשלוש שורות טקסט, והחלפתו במסך התוצאה המלא היא קפיצה של מסך שלם —
          כלומר בדיוק הרושם של "משהו נטען מחדש" שרצינו להעלים. */}
      <div
        aria-hidden="true"
        className="mt-8 h-[320px] border border-graphite/10 sm:h-[440px]"
        style={{ background: "linear-gradient(180deg,#efeae1,#e0d9cd)" }}
      />
    </section>
  );
}
