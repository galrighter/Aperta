import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import {
  existingRunIds, listRuns, designsForRuns, versionsForRuns,
  type RunStagePaths, type RunStatusFilter,
} from "@/lib/db/runs";
import { designCode } from "@/lib/designCode";
import { jobFailuresForRuns, listRecentJobs } from "@/lib/db/jobs";
import { orphanJobs, type OrphanItem } from "@/lib/runs/orphans";
import { decodeRunCursor, encodeRunCursor, legacyRunCursor } from "@/lib/runs/cursor";

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
// והרשימה מעומדת: `limit` + `cursor` (סמן, לא `offset`). קודם היא החזירה 80
// הרצות קבועות — גם כבד וגם קטוע, כי הרצה שמעבר ל-80 פשוט לא הייתה קיימת במסך.
// גם הסינון עבר לכאן: "נכשלו" סורק את כל ההיסטוריה, ולא רק את מה שנטען.
// הספירה יושבת ב-/api/debug/log/counts — מספר בלי שורות.
//
// הסמן היה חותמת הזמן כמו שהיא (`before`), והוא נסע גולמי בשורת הכתובת עם ה-`+`
// של אזור הזמן. הוא הגיע לכאן כרווח, יצא ככה ל-Supabase, וכל לחיצה על "עוד"
// חזרה 400: `invalid input syntax for type timestamp with time zone`. עכשיו הוא
// base64url של `(created_at, id)` — ראה `lib/runs/cursor`.

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

/**
 * אותו קיצוץ, על `inputs`: הטקסטים הארוכים של שלב הטקסט יורדים מהרשימה.
 *
 * `spec` נחתך ב-8,000 תווים ו-`prompt` ב-12,000 — כלומר עד 20KB לכל שורת Story,
 * על שדות שאף אחד מהם אינו מוצג ברשימה: התגיות קוראות את המספרים בלבד, וחלון
 * הפרומפט ממילא טוען את הפירוט המלא (`/api/debug/log/<id>`) ומעדיף אותו. זו
 * בדיוק ההנמקה של `slimDebug` — ועד כאן היא לא חלה על `inputs`, שגדל בשקט.
 */
function slimInputs(inputs: unknown): unknown {
  if (!inputs || typeof inputs !== "object") return inputs;
  const i = inputs as Record<string, unknown>;
  const out: Record<string, unknown> = { ...i };

  const stage = i.designStage;
  if (stage && typeof stage === "object") {
    const { prompt, system, spec, ...rest } = stage as Record<string, unknown>;
    // הנוכחות נשמרת גם כשהתוכן יורד: בלעדיה הרשימה לא יכולה לומר שיש מה לפתוח.
    out.designStage = { ...rest, hasPrompt: Boolean(prompt || system), hasSpec: Boolean(spec) };
  }

  // dialogue mode — אותו קיצוץ בדיוק על שלב העריכה, ומאותו נימוק: `prompt`
  // נחתך ב-12,000 תווים ו-`decision` ב-8,000, ואף אחד מהם אינו מוצג ברשימה.
  // בלי זה כל שורת עריכה במסלול הזה גוררת עד 20KB — והרשימה גדלה בשקט, וזה
  // בדיוק מה ש-`slimDebug` נכתב כדי למנוע.
  //
  // ‏`request`, `region`, `scope` ו-`clarification` **נשארים**: הם קצרים,
  // והם מה שהתגיות קוראות.
  const edit = i.editStage;
  if (edit && typeof edit === "object") {
    const { prompt, system, decision, ...rest } = edit as Record<string, unknown>;
    out.editStage = { ...rest, hasPrompt: Boolean(prompt || system), hasSpec: Boolean(decision) };
  }

  return out;
}

export async function GET(req: Request) {
  try {
    // היומן נושא טקסט חופשי שלקוחות כתבו, את הפרומפט המלא ואת ההדמיות. עד
    // עכשיו הוא היה פתוח לכל מי שידע את הכתובת.
    requireAdmin(req);
    const params = new URL(req.url).searchParams;
    const limit = pageSize(params.get("limit"));
    // `before` הוא הסמן הישן (חותמת בלבד) — מתקבל כדי שלשונית שנפתחה לפני
    // הפריסה תמשיך לעמד במקום להיתקע על כפתור שלא עושה כלום.
    const cursor = decodeRunCursor(params.get("cursor")) ?? legacyRunCursor(params.get("before"));
    const statusParam = params.get("status");
    const status: RunStatusFilter | null =
      statusParam === "approved" || statusParam === "problem" ? statusParam : null;

    // שורה אחת מעל גודל העמוד היא הדרך הזולה לדעת אם יש עמוד נוסף — בלי
    // שאילתת ספירה שנייה לכל גלילה.
    const fetched = await listRuns({ limit: limit + 1, cursor, status });
    const hasMore = fetched.length > limit;
    const rows = hasMore ? fetched.slice(0, limit) : fetched;
    const last = hasMore && rows.length ? rows[rows.length - 1] : null;
    const nextCursor = last ? encodeRunCursor(last) : null;
    const before = cursor?.createdAt ?? null;

    // ניסיון שלא הגיע לשורת הרצה. בלעדיו יצירה שנקטעה נעדרת מהיומן לגמרי,
    // ו"אין שורה" נראה בדיוק כמו "לא היה ניסיון" — המקרה היחיד שאי אפשר לאבחן.
    // בסינון "הצליחו" אין להם מקום: בקשה בלי הרצה לא הצליחה בהגדרה.
    let orphans: OrphanItem[] = [];
    if (status !== "approved") {
      try {
        const jobs = await listRecentJobs(80);
        // הקיום נשאל מול הטבלה ולא מול העמוד: תחת "נכשלו" העמוד מכיל רק הרצות
        // שלא אושרו, וכל השאר היו נראות משם כאילו לא נכתבו מעולם.
        const known = await existingRunIds(jobs.map((j) => j.run_id).filter((v): v is string => !!v));
        orphans = orphanJobs(jobs, rows, { before, toEnd: !hasMore, known });
      } catch (e) {
        // תוספת, לא תנאי: אם טבלת ה-jobs לא זמינה עדיף יומן בלעדיה מאשר בלי יומן.
        console.error("orphan job lookup failed:", (e as Error).message);
      }
    }

    // הבעלים של כל שורה, בשאילתה אחת לכל היומן — כדי שאפשר יהיה לקבץ אותו לפי
    // משתמש ולא רק לפי זמן. גם ניסיון שנקטע מקבל שיוך: שם הוא הכי נחוץ.
    const { owners, serials } = await designsForRuns(
      [...rows.map((r) => r.design_id), ...orphans.map((o) => o.designId)].filter(
        (v): v is string => !!v,
      ),
    );
    // הגרסה של כל הרצה — מה שהכפתור בשורה צריך כדי למשוך קובץ ייצור בלי
    // לפתוח את הפירוט. שאילתה אחת לעמוד, כמו הבעלים.
    const versions = await versionsForRuns(rows.map((r) => r.id));
    // והכשל של הבקשה שמאחורי כל הרצה. שורת ההרצה נכתבת באמצע הצינור, וכל מה
    // שנכשל אחריה נרשם על ה-job בלבד — ולכן הרצה יכולה להיראות "approved · אין
    // שגיאה" בזמן שהלקוחה לא קיבלה דבר. ראו `jobFailuresForRuns`.
    const jobFailures = await jobFailuresForRuns(rows.map((r) => r.id));

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
        /**
         * הכשל של בקשת היצירה שההרצה הזו שייכת לה — מה שנרשם על ה-job ולא על
         * שורת ההרצה. זה מה שהופך "approved · אין שגיאה" על הרצה שלא הולידה
         * דבר לשורה שאומרת מה קרה בפועל.
         */
        jobError: jobFailures.get(r.id) ?? null,
        durationMs: r.duration_ms,
        renderModel: r.render_model,
        renderUrl: r.render_path ? image("render") : null,
        /** מה שהמשתמש צירף בעצמו — נפרד מההדמיה שנוצרה ממנו. */
        inputImageUrl: r.input_image_path ? image("input") : null,
        /** המאפיינים שקבעו את ההרצה. הפרומפטים המלאים כבדים ונטענים רק
         *  בפתיחה — ראה `slimInputs`. */
        inputs: slimInputs(r.inputs ?? null),
        owner: (r.design_id && owners.get(r.design_id)) || null,
        designId: r.design_id,
        /** `AP-0047` — הרפרנס שתלונה מגיעה איתו. ה-uuid אינו רפרנס אנושי. */
        ref: (r.design_id && designCode(serials.get(r.design_id) ?? null)) || null,
        stages: {
          /** תמונת הייחוס כפי שנמסרה למודל — לא שחזור שלה. */
          reference: stages.reference ? image("reference") : null,
          conditioned: stages.conditioned ? image("conditioned") : null,
          overlay: stages.overlay ? image("overlay") : null,
          difference: stages.difference ? image("difference") : null,
          rendered: stages.rendered ? image("rendered") : null,
        },
        /** ה-SVG הסופי נטען בפירוט; ברשימה רק האם הוא קיים. */
        hasSvg: r.has_svg,
        /**
         * הגרסה שההרצה שמרה. זה מה שיש ממנו קובץ ייצור, ולכן זה מה שקובע אם
         * כפתור ה-SVG בשורה פעיל. `null` = ההרצה לא הגיעה לגרסה, או שהיא
         * מלפני 0012 ואין לה `generation_id`.
         */
        version: versions.get(r.id) ?? null,
        metrics: r.metrics,
        debug: slimDebug(r.debug),
      };
    });
    const withOwners = orphans.map((o) => ({
      ...o,
      // ניסיון בלי שורת הרצה לא שמר גרסה, ולכן אין לו קובץ ייצור.
      version: null,
      owner: (o.designId && owners.get(o.designId)) || null,
      ref: (o.designId && designCode(serials.get(o.designId) ?? null)) || null,
    }));

    // `localeCompare` היה משווה כאן חותמות ISO לפי כללי מיון של שפה, שבהם
    // סימני פיסוק אינם בסדר ה-codepoint שלהם — חותמת בלי שבריר שנייה (Postgres
    // משמיט אותו כשהוא אפס) הייתה נופלת בצד הלא נכון של שכנתה. ההשוואה כאן היא
    // על הזמן עצמו, ושובר השוויון הוא המזהה — אותו סדר שהשאילתה מחזירה.
    const merged = [...items, ...withOwners].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
    // `nextBefore` נשאר חותמת, ולא הסמן החדש: לשונית שנפתחה לפני הפריסה שולחת
    // בחזרה בדיוק את מה שהיא קיבלה, וסמן שהיא לא יודעת לקרוא היה מחזיר אותה
    // לראש היומן בלולאה.
    return NextResponse.json({
      items: merged,
      hasMore,
      nextCursor,
      nextBefore: last ? last.created_at : null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
