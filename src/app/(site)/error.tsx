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
      {/* מזהה השגיאה של Next — מה שמאפשר למצוא אותה ביומן כשמדווחים עליה. */}
      {error.digest && (
        <p className="mt-8 font-mono text-[11px] text-mist" dir="ltr">
          {error.digest}
        </p>
      )}
    </section>
  );
}
