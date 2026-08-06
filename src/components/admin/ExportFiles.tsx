"use client";

/**
 * הורדת קבצי הייצור של גרסה — DXF ו-SVG במילימטרים, כל אחד בכפתור נפרד
 * (5.8.26): קודם לחיצה אחת הכינה את שני הקבצים וחשפה שני קישורים, ושמירה
 * ב"שמירת קישור בשם" הייתה תלויה ב-Content-Disposition ממקור אחר (Supabase
 * Storage) — ולפעמים הגיעה בלי הסיומת הנכונה. כאן כל כפתור מוריד קובץ אחד,
 * וההורדה עצמה עוברת דרך blob עם שם קובץ מפורש (`download()` למטה) ולא
 * מסתמכת על מה שהדפדפן יחליט לגזור מהכתובת.
 *
 * זה מה שנחתך בפועל: המתאר של המתכת שנשארת, אחרי שהחיתוכים הוחסרו ממנה
 * (`lib/export/build.ts`). זה **לא** ה-SVG שמוצג בכרטיס וביומן, שהוא
 * הגאומטריה של מה שנחתך בקנה מידה של התצוגה. השניים נראים דומה ואינם אותו
 * קובץ, ולכן הכותרת כאן היא "קבצי ייצור" ולא "SVG".
 *
 * רכיב אחד לשלושת המקומות שמורידים אותם — לשונית העיצובים, מסך ההזמנה ויומן
 * היצירות. קודם הוא היה משוכפל בין השניים הראשונים, ושלושה עותקים של אותו
 * טיפול בשגיאות הם שלוש התנהגויות שונות בפעם הבאה שאחד מהם משתנה.
 *
 * הקישורים נחתמים לשעה, ולכן הם מיוצרים בלחיצה ולא מראש. שני הכפתורים
 * חולקים את אותה בקשת הכנה — לחיצה על השני אחרי הראשון לא בונה שוב.
 */
import { useState } from "react";
import { he } from "@/i18n/he";

const s = he.site;

type Kind = "svg" | "dxf";
type FilesState = { svgUrl: string; dxfUrl: string; warn: boolean };

/**
 * הורדה כ-blob עם שם קובץ מפורש, ולא קליק על קישור לדומיין אחר: `download`
 * על `<a>` מתעלם מקישורים cross-origin, וההורדה נופלת כולה על
 * Content-Disposition שהוגדר בצד השרת החתום — ערוץ שאין עליו שליטה כאן.
 * ה-blob הוא same-origin, ולכן `download` עליו תקף בכל דפדפן.
 */
async function saveAs(url: string, fallbackName: string) {
  const name = new URL(url).searchParams.get("download") ?? fallbackName;
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function ExportFiles({
  designId,
  versionId = null,
  note,
  className,
}: {
  designId: string;
  /**
   * גרסה מפורשת. בלעדיה נלקחת הגרסה הנוכחית של העיצוב — וזה נכון רק כשזו
   * באמת השאלה. בהזמנה זו הגרסה שהוזמנה, וביומן זו הגרסה שההרצה שמרה.
   */
  versionId?: string | null;
  /** הבהרה ליד הכפתורים: איזו גרסה זו, כשהיא לא "הנוכחית". */
  note?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "error" | "blocked" | "none">("idle");
  const [busy, setBusy] = useState<Kind | null>(null);
  const [files, setFiles] = useState<FilesState | null>(null);

  /** בונה את שני הקבצים בפעם הראשונה בלבד; לחיצה על הכפתור השני משתמשת במה שכבר יש. */
  async function ensureFiles(): Promise<FilesState | null> {
    if (files) return files;
    const res = await fetch(`/api/admin/designs/${designId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      // "נכשל בוולידציה" ו"אין גרסה" הם מצבים שאפשר לעשות איתם משהו, בניגוד
      // לתקלה — ולכן הם נאמרים בנפרד ולא כ"ההכנה נכשלה".
      setStatus(
        body?.error?.code === "export_blocked"
          ? "blocked"
          : body?.error?.code === "no_version"
            ? "none"
            : "error",
      );
      return null;
    }
    const body = (await res.json()) as { svgUrl: string; dxfUrl: string; validationStatus: string };
    const next = { svgUrl: body.svgUrl, dxfUrl: body.dxfUrl, warn: body.validationStatus === "warn" };
    setFiles(next);
    setStatus("idle");
    return next;
  }

  async function download(kind: Kind) {
    setBusy(kind);
    try {
      const f = await ensureFiles();
      if (f) await saveAs(kind === "svg" ? f.svgUrl : f.dxfUrl, `export.${kind}`);
    } catch {
      setStatus("error");
    }
    setBusy(null);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-mist">{s.adminExport}</span>
        <button
          type="button"
          onClick={() => void download("svg")}
          disabled={busy !== null}
          className="font-semibold text-lapis hover:underline disabled:text-mist disabled:no-underline"
        >
          {busy === "svg" ? s.adminExporting : s.adminExportSvg}
        </button>
        <button
          type="button"
          onClick={() => void download("dxf")}
          disabled={busy !== null}
          className="font-semibold text-lapis hover:underline disabled:text-mist disabled:no-underline"
        >
          {busy === "dxf" ? s.adminExporting : s.adminExportDxf}
        </button>
        {note && <span className="text-[12px] text-mist">· {note}</span>}
      </div>
      {files?.warn && <p className="mt-1 text-[12px] text-[#8a6d12]">{s.adminExportWarn}</p>}
      {status === "blocked" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportBlocked}</p>}
      {status === "none" && <p className="mt-1 text-[12px] text-mist">{s.adminExportNone}</p>}
      {status === "error" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportError}</p>}
    </div>
  );
}
