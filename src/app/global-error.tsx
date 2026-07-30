"use client";

// המוצא האחרון: שגיאה ב-layout השורש, או בכל מסלול שאין מעליו `error.tsx`
// (הסטודיו, הבק־אופיס). global-error מחליף את המסמך כולו, ולכן הוא חייב
// לרנדר בעצמו <html> ו-<body> — וגם לא נהנה מהעיצוב של ה-layout, ומכאן
// הסגנון המוטבע.
import { useEffect } from "react";
import { he } from "@/i18n/he";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, background: "#f4f1eb", color: "#202326", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 620, margin: "0 auto", padding: "96px 20px", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 600 }}>{he.errBoundaryTitle}</h1>
          <p style={{ margin: "0 0 32px", fontSize: 15, lineHeight: 1.7, color: "rgba(32,35,38,0.6)" }}>
            {he.errBoundaryBody}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#202326", color: "#f4f1eb", border: 0, borderRadius: 2,
              padding: "12px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            {he.retry}
          </button>
          {error.digest && (
            <p dir="ltr" style={{ marginTop: 32, fontSize: 11, fontFamily: "monospace", color: "rgba(32,35,38,0.4)" }}>
              {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
