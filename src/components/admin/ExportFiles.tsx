"use client";

/**
 * הורדת קבצי הייצור של גרסה — DXF ו-SVG במילימטרים.
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
 * הקישורים נחתמים לשעה, ולכן הם מיוצרים בלחיצה ולא מראש.
 */
import { useState } from "react";
import { he } from "@/i18n/he";

const s = he.site;

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
  /** הבהרה ליד הקישורים: איזו גרסה זו, כשהיא לא "הנוכחית". */
  note?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "error" | "blocked" | "none">("idle");
  const [files, setFiles] = useState<{ svgUrl: string; dxfUrl: string; warn: boolean } | null>(null);

  async function run() {
    setState("busy");
    const res = await fetch(`/api/admin/designs/${designId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      // "נכשל בוולידציה" ו"אין גרסה" הם מצבים שאפשר לעשות איתם משהו, בניגוד
      // לתקלה — ולכן הם נאמרים בנפרד ולא כ"ההכנה נכשלה".
      setState(
        body?.error?.code === "export_blocked"
          ? "blocked"
          : body?.error?.code === "no_version"
            ? "none"
            : "error",
      );
      return;
    }
    const body = (await res.json()) as { svgUrl: string; dxfUrl: string; validationStatus: string };
    setFiles({ svgUrl: body.svgUrl, dxfUrl: body.dxfUrl, warn: body.validationStatus === "warn" });
    setState("idle");
  }

  if (files) {
    return (
      <div className={className}>
        <div className="flex flex-wrap gap-3 text-[13px]">
          <a href={files.svgUrl} className="font-semibold text-cobalt hover:underline">
            {s.adminExportSvg}
          </a>
          <a href={files.dxfUrl} className="font-semibold text-cobalt hover:underline">
            {s.adminExportDxf}
          </a>
          {note && <span className="text-[12px] text-mist">· {note}</span>}
        </div>
        {files.warn && <p className="mt-1 text-[12px] text-[#8a6d12]">{s.adminExportWarn}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "busy"}
        className="text-[13px] text-cobalt hover:underline disabled:text-mist disabled:no-underline"
      >
        {state === "busy" ? s.adminExporting : s.adminExport}
      </button>
      {note && state === "idle" && <span className="ms-2 text-[12px] text-mist">· {note}</span>}
      {state === "blocked" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportBlocked}</p>}
      {state === "none" && <p className="mt-1 text-[12px] text-mist">{s.adminExportNone}</p>}
      {state === "error" && <p className="mt-1 text-[12px] text-[#c0413b]">{s.adminExportError}</p>}
    </div>
  );
}
