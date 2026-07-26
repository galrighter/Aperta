import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { listRuns, type RunStagePaths } from "@/lib/db/runs";
import { signedUrl } from "@/lib/db/storage";

// בק־אופיס: יומן כל הרצות הצינור (מכל המסלולים) — הדמיה, שלבי ביניים, סטטוס
// ומדדים, כדי לאבחן בעיות מתלונות משתמשים ולכייל יחד את איכות ההמרה.
//
// רשימה בלבד, בכוונה: ה-SVG הסופי ושלושה־עשר ה-SVG של המועמדים נשארים בחוץ.
// כשכל מועמד נשא את ה-SVG שלו התשובה הגיעה ל-19.7MB אחרי 38 הרצות, הדפדפן נפל
// עליה, והדף — שמתרגם כל כשל ל-log=[] — הציג "אין הרצות". הפירוט המלא של הרצה
// אחת יושב ב-/api/debug/log/<id> ונטען רק בפתיחה.

export const maxDuration = 60;

async function sign(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    return await signedUrl(path, 3600);
  } catch {
    return null;
  }
}

/** מסיר את ה-SVG הכבדים מה-debug ומשאיר את כל המדדים שהרשימה מציגה. */
function slimDebug(debug: unknown): unknown {
  if (!debug || typeof debug !== "object") return debug;
  const d = debug as Record<string, unknown>;
  if (!Array.isArray(d.candidates)) return d;
  const candidates = (d.candidates as Array<Record<string, unknown>>).map((c) => {
    const { metal_svg, cutouts_svg, ...rest } = c;
    return { ...rest, has_svg: Boolean(metal_svg || cutouts_svg) };
  });
  return { ...d, candidates };
}

export async function GET() {
  try {
    const rows = await listRuns(80);
    const items = await Promise.all(
      rows.map(async (r) => {
        const stages = (r.stage_paths ?? {}) as RunStagePaths;
        const [renderUrl, conditioned, overlay, difference, rendered] = await Promise.all([
          sign(r.render_path),
          sign(stages.conditioned),
          sign(stages.overlay),
          sign(stages.difference),
          sign(stages.rendered),
        ]);
        return {
          id: r.id,
          createdAt: r.created_at,
          source: r.source,
          productType: r.product_type,
          prompt: r.prompt,
          colorKey: r.color_key,
          status: r.status,
          error: r.error,
          durationMs: r.duration_ms,
          renderModel: r.render_model,
          renderUrl,
          stages: { conditioned, overlay, difference, rendered },
          /** ה-SVG הסופי נטען בפירוט; ברשימה רק האם הוא קיים. */
          hasSvg: Boolean(r.svg),
          metrics: r.metrics,
          debug: slimDebug(r.debug),
        };
      }),
    );
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}
