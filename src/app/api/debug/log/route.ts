import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { listRuns, ownersByDesign, type RunStagePaths, type RunStatusFilter } from "@/lib/db/runs";
import { listRecentJobs } from "@/lib/db/jobs";
import { orphanJobs, type OrphanItem } from "@/lib/runs/orphans";

// בק־אופיס: יומן כל הרצות הצינור (מכל המסלולים) — הדמיה, שלבי ביניים, סטטוס
// ומדדים, כדי לאבחן בעיות מתלונות משתמשים ולכייל יחד את איכות ההמרה.
//
// רשימה בלבד, בכוונה: ה-SVG הסופי ושלושה־עשר ה-SVG של המועמדים נשארים בחוץ.
// כשכל מועמד נשא את ה-SVG שלו התשובה הגיעה ל-19.7MB אחרי 38 הרצות, הדפדפן נפל
// עליה, והדף — שמתרגם כל כשל ל-log=[] — הציג "אין הרצות". הפירוט המלא של הרצה
// אחת יושב ב-/api/debug/log/<id> ונטען רק בפתיחה.
//
// גם התמונות נשארות בחוץ, ומאותו סוג של סיבה: חתימת חמש כתובות לכל אחת מ-80
// השורות היא 400 בקשות ל-Supabase בבקשה אחת, מול תקרה של 50 subrequests. מהשורה
// העשירית ואילך כל חתימה נכשלה בשקט והיומן הופיע בלי תמונות. מה שחוזר כאן הוא
// קישור ל-/api/debug/log/<id>/image/<name>, שחותם בעצמו — בקשה לתמונה, תקציב
// לתמונה. עלות הרשימה ירדה מ-401 בקשות לאחת.
//
// והרשימה מעומדת: `limit` + `before` (סמן זמן, לא `offset`). קודם היא החזירה 80
// הרצות קבועות — גם כבד וגם קטוע, כי הרצה שמעבר ל-80 פשוט לא הייתה קיימת במסך.
// גם הסינון עבר לכאן: "נכשלו" סורק את כל ההיסטוריה, ולא רק את מה שנטען.
// הספירה יושבת ב-/api/debug/log/counts — מספר בלי שורות.

export const maxDuration = 60;

/** גודל עמוד. 80 בבת אחת היו תשובה כבדה שנטענה שניות לפני שהופיע משהו. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 80;

const pageSize = (raw: string | null): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
};

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

export async function GET(req: Request) {
  try {
    // היומן נושא טקסט חופשי שלקוחות כתבו, את הפרומפט המלא ואת ההדמיות. עד
    // עכשיו הוא היה פתוח לכל מי שידע את הכתובת.
    requireAdmin(req);
    const params = new URL(req.url).searchParams;
    const limit = pageSize(params.get("limit"));
    const before = params.get("before");
    const statusParam = params.get("status");
    const status: RunStatusFilter | null =
      statusParam === "approved" || statusParam === "problem" ? statusParam : null;

    // שורה אחת מעל גודל העמוד היא הדרך הזולה לדעת אם יש עמוד נוסף — בלי
    // שאילתת ספירה שנייה לכל גלילה.
    const fetched = await listRuns({ limit: limit + 1, before, status });
    const hasMore = fetched.length > limit;
    const rows = hasMore ? fetched.slice(0, limit) : fetched;
    const nextBefore = hasMore && rows.length ? rows[rows.length - 1].created_at : null;

    // ניסיון שלא הגיע לשורת הרצה. בלעדיו יצירה שנקטעה נעדרת מהיומן לגמרי,
    // ו"אין שורה" נראה בדיוק כמו "לא היה ניסיון" — המקרה היחיד שאי אפשר לאבחן.
    // בסינון "הצליחו" אין להם מקום: בקשה בלי הרצה לא הצליחה בהגדרה.
    let orphans: OrphanItem[] = [];
    if (status !== "approved") {
      try {
        orphans = orphanJobs(await listRecentJobs(80), rows, {
          before,
          toEnd: !hasMore,
        });
      } catch (e) {
        // תוספת, לא תנאי: אם טבלת ה-jobs לא זמינה עדיף יומן בלעדיה מאשר בלי יומן.
        console.error("orphan job lookup failed:", (e as Error).message);
      }
    }

    // הבעלים של כל שורה, בשאילתה אחת לכל היומן — כדי שאפשר יהיה לקבץ אותו לפי
    // משתמש ולא רק לפי זמן. גם ניסיון שנקטע מקבל שיוך: שם הוא הכי נחוץ.
    const owners = await ownersByDesign(
      [...rows.map((r) => r.design_id), ...orphans.map((o) => o.designId)].filter(
        (v): v is string => !!v,
      ),
    );
    const items = rows.map((r) => {
      const stages = (r.stage_paths ?? {}) as RunStagePaths;
      const image = (name: string) => `/api/debug/log/${r.id}/image/${name}`;
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
        renderUrl: r.render_path ? image("render") : null,
        /** מה שהמשתמש צירף בעצמו — נפרד מההדמיה שנוצרה ממנו. */
        inputImageUrl: r.input_image_path ? image("input") : null,
        /** המאפיינים שקבעו את ההרצה. הפרומפט המלא כבד ונטען רק בפתיחה. */
        inputs: r.inputs ?? null,
        owner: (r.design_id && owners.get(r.design_id)) || null,
        designId: r.design_id,
        stages: {
          conditioned: stages.conditioned ? image("conditioned") : null,
          overlay: stages.overlay ? image("overlay") : null,
          difference: stages.difference ? image("difference") : null,
          rendered: stages.rendered ? image("rendered") : null,
        },
        /** ה-SVG הסופי נטען בפירוט; ברשימה רק האם הוא קיים. */
        hasSvg: r.has_svg,
        metrics: r.metrics,
        debug: slimDebug(r.debug),
      };
    });
    const withOwners = orphans.map((o) => ({
      ...o,
      owner: (o.designId && owners.get(o.designId)) || null,
    }));

    const merged = [...items, ...withOwners].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ items: merged, hasMore, nextBefore });
  } catch (err) {
    return handleRouteError(err);
  }
}
