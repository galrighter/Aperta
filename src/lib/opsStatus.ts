import { supabaseAdmin } from "@/lib/db/supabase";
import { countErrorRunsSince } from "@/lib/db/runs";

// תמונת מצב תפעולית לקורא-מכונה — התורן האוטומטי (docs/AUTOFIX_ROUTINE.md).
//
// למה זה קיים: יומן ההרצות המלא חי מאחורי עוגיית האדמין ונבנה לעיניים של גל.
// התורן — סשן קלוד שרץ ברוטין — צריך את אותה תשובה בדיוק ("מה נשבר, ממתי,
// באיזה נוסח") אבל דרך שער-מכונה וכ-JSON רזה: בלי SVG, בלי debug, בלי עימוד.
// זו קריאה בלבד — האבחון קורא, ההחלטות (תיקון, מיזוג, מייל) עוברות בשערים
// שכבר קיימים: CI על ה-PR, ה-canary, והדדופ של ה-comeback.

/** כמה שורות-בעיה אחרונות נחשפות. מספיק לראות דפוס; לא דף יומן שלם. */
const PROBLEMS_LIMIT = 15;
/** קיצוץ הודעת שגיאה. הראיה נמצאת בתחילת ההודעה; 300 תווים שומרים גם את
 *  גוף ה-429 של הספק בלי לגרור stack שלם לתוך ה-workflow log. */
const ERROR_SNIPPET = 300;

export interface OpsProblemRun {
  id: string;
  createdAt: string;
  /** `error` | `rejected` — כל מה שאינו `approved`. */
  status: string;
  error: string | null;
  designId: string | null;
  source: string | null;
  durationMs: number | null;
}

export interface OpsStatus {
  now: string;
  /** כשלי `error` (לא `rejected` — דחייה היא תוצאה לגיטימית של הצינור). */
  errorsLast2h: number;
  errorsLast24h: number;
  /** עיצובים בלי גרסה מהיומיים האחרונים — מי שנתקע ועוד לא קיבל תוצאה. */
  stuckDesigns48h: number;
  /** מתי הצליחה יצירה בפעם האחרונה — מפריד "הכול שבור" מ"מקרה בודד". */
  lastApprovedAt: string | null;
  /** ההרצות הבעייתיות האחרונות, מהחדשה לישנה. */
  recentProblems: OpsProblemRun[];
  /**
   * פרופילים שמצביעים למשתמש אימות שאינו קיים (0024).
   *
   * עד 16.8 מצב כזה נמנע ב-FK, שהוסר כדי שהגיבוי יהיה בר-שחזור בפעולה אחת.
   * מה שהוא מנע — הקוד מונע (‏`linkAuthUser` הוא הכותב היחיד, והוא מרפא
   * מזהה מיותם בכניסה הבאה); מה שהוא **הבטיח** — שזה לא יקרה בשקט — עבר
   * לכאן. מספר גדול מאפס אינו תקלה בהכרח: משתמש שנמחק ידנית ועוד לא נכנס
   * שוב ייספר כאן עד שייכנס. מספר שגדל ולא יורד הוא כן סיפור.
   *
   * `null` = השאילתה לא הצליחה (מסד שעוד לא קיבל את 0024). "לא נמדד" ו-0
   * הם שתי תשובות שונות, ובסטטוס תפעולי אסור לבלבל ביניהן.
   */
  danglingAuthLinks: number | null;
}

export async function opsStatus(): Promise<OpsStatus> {
  const sb = supabaseAdmin();
  const now = new Date();
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();

  const [errors2h, errors24h, stuck, lastApproved, problems, dangling] = await Promise.all([
    countErrorRunsSince(iso(2 * 60 * 60_000)),
    countErrorRunsSince(iso(24 * 60 * 60_000)),
    sb
      .from("designs")
      .select("id", { count: "exact", head: true })
      .is("current_version_id", null)
      .gte("created_at", iso(48 * 60 * 60_000)),
    sb
      .from("generation_runs")
      .select("created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1),
    sb
      .from("generation_runs")
      .select("id, created_at, status, error, design_id, source, duration_ms")
      .neq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(PROBLEMS_LIMIT),
    // ‏RPC ולא שאילתה: `auth.users` אינה חשופה דרך PostgREST, ולכן ההצלבה
    // חייבת לרוץ במסד (‏`dangling_auth_links`, ‏security definer, 0024).
    //
    // **לא זורק.** זה חיישן היגיינה בתוך תמונת מצב תפעולית, ומסד שעוד לא
    // קיבל את 0024 יחזיר שגיאה — שהיא לא סיבה להשבית את כל הסטטוס, שהוא
    // הדבר שהתורן קורא כדי לדעת אם היצירה חיה.
    sb.rpc("dangling_auth_links").then(
      (r) => (r.error ? null : (r.data as number)),
      () => null,
    ),
  ]);
  if (stuck.error) throw new Error(stuck.error.message);
  if (lastApproved.error) throw new Error(lastApproved.error.message);
  if (problems.error) throw new Error(problems.error.message);

  type Row = {
    id: string;
    created_at: string;
    status: string;
    error: string | null;
    design_id: string | null;
    source: string | null;
    duration_ms: number | null;
  };

  return {
    now: now.toISOString(),
    errorsLast2h: errors2h,
    errorsLast24h: errors24h,
    stuckDesigns48h: stuck.count ?? 0,
    lastApprovedAt:
      ((lastApproved.data ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null,
    recentProblems: ((problems.data ?? []) as Row[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      status: r.status,
      error: r.error ? r.error.slice(0, ERROR_SNIPPET) : null,
      designId: r.design_id,
      source: r.source,
      durationMs: r.duration_ms,
    })),
    danglingAuthLinks: dangling,
  };
}
