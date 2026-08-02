"use client";

// גבול שגיאה לאתר ולמסע היצירה.
//
// בלעדיו כל זריקה בודדת ברכיב לקוח — הדמיה שלא קיבלה WebGL, שדה חסר בדוח
// ולידציה ישן — מוחקת את העמוד כולו ומשאירה את המסך הלבן של Next עם
// "Application error: a client-side exception has occurred". זה נמדד בייצור.
// כאן נשארים הכותרת, התחתית והמסלול חזרה, והשגיאה עצמה נרשמת ל-console כדי
// שאפשר יהיה לאבחן אותה מהמכשיר של הלקוחה.
import { useEffect } from "react";
import Link from "next/link";
import { he } from "@/i18n/he";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[site error]", error);
  }, [error]);

  return (
    <section className="mx-auto max-w-[620px] px-5 py-24 text-center sm:px-10">
      <h1 className="mb-3 text-[26px] font-semibold tracking-tight text-graphite">
        {he.errBoundaryTitle}
      </h1>
      <p className="mb-8 text-[15px] leading-relaxed text-ink60">{he.errBoundaryBody}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-[2px] bg-graphite px-6 py-3 text-[15px] font-semibold text-porcelain transition-colors hover:bg-graphite/90"
        >
          {he.retry}
        </button>
        <Link href="/" className="text-[13px] text-cobalt underline-offset-4 hover:underline">
          {he.errBoundaryHome}
        </Link>
      </div>
      {/* מה שנשבר, בשביל מי שמדווח.
          `console.error` למעלה מספיק כשיש גישה לכלי מפתחים — ובטלפון אין.
          קריסה שדווחה מהשדה ב-2.8 ("קיבלתי הודעת שגיאה") לא ניתנת היתה
          לאבחון משום שהמסך לא אמר דבר מלבד "משהו נשבר", והשחזור מנתונים
          סינתטיים לא הצליח. מקופל, כדי שזה יישאר טקסט למי שמחפש אותו. */}
      {(error.message || error.digest) && (
        <details className="mt-8 text-start">
          <summary className="cursor-pointer text-center text-[12px] text-mist">
            {he.errBoundaryDetails}
          </summary>
          <pre
            dir="ltr"
            className="mt-3 overflow-x-auto whitespace-pre-wrap break-words bg-white p-3 font-mono text-[11px] leading-relaxed text-ink60"
          >
            {[error.message, error.digest && `digest: ${error.digest}`].filter(Boolean).join("\n")}
          </pre>
        </details>
      )}
    </section>
  );
}
