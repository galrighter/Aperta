export type FaqItem = { q: string; a: string };

/**
 * אקורדיון השאלות — `<details>`/`<summary>` נייטיבי, בלי JavaScript.
 *
 * הגרסה הקודמת הייתה `"use client"` עם `useState`, והתשובה נכתבה בתנאי:
 * `{open && <div>{item.a}</div>}`. זה לא הסתיר את התשובה — הוא לא יצר אותה.
 * ב-SSR רק הפריט הראשון היה פתוח, ולכן ה-HTML שיצא מהשרת נשא שאלה אחת עם
 * תשובה ושמונה שאלות בלי. הזחלנים שאינם מריצים JavaScript — וזה כולל את
 * `OAI-SearchBot`, שמזין את ChatGPT — ראו עמוד שאלות בלי תשובות. `/faq` הוא
 * העמוד היחיד באתר שכתוב בפורמט שמנוע תשובות מצטט, ורוב התוכן שלו לא הגיע
 * לשם.
 *
 * `<details>` פותר את זה במקור: כל התוכן ב-DOM תמיד, הקיפול נעשה בדפדפן,
 * `aria-expanded` ומקלדת מגיעים מובנים, והקומפוננטה חוזרת להיות שרת בלבד —
 * כלומר גם פחות JavaScript בעמוד.
 *
 * `name="faq"` שומר על ההתנהגות הקיימת (פריט אחד פתוח בכל רגע) בלי שורת קוד
 * אחת: זו קבוצת אקורדיון נייטיבית. דפדפן ישן שאינו מכיר את התכונה יאפשר
 * לפתוח כמה פריטים יחד — פחיתה מנומסת, לא שבירה.
 */
export default function FaqAccordion({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="divide-y divide-graphite/10 overflow-hidden rounded-[2px] border border-graphite/10 bg-white">
      {items.map((item, i) => (
        <details key={i} name="faq" open={i === 0} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-right transition-colors hover:bg-porcelain [&::-webkit-details-marker]:hidden">
            <h2 className="text-base font-semibold text-graphite">{item.q}</h2>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
              className="shrink-0 text-mist transition-transform group-open:rotate-180"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <div className="px-6 pb-5 text-sm leading-relaxed text-ink60">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
