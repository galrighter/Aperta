import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import { newShareToken } from "@/lib/shareToken";
import type { ProductType } from "@/lib/fabrication.config";
import type { LetterBridge } from "@/lib/geometry/restoreBridges";
import type { MultiPolygon } from "@/lib/geometry/types";

// שכבת הגישה ל-`design_shares` (migration 0013). service role בלבד.
//
// כל שורה כאן היא צילום מצב של מה ששותף ולא מצביע לגרסה — הנימוק המלא במיגרציה.

export interface ShareRow {
  id: string;
  token: string;
  design_id: string;
  version_id: string | null;
  product_type: ProductType;
  length_mm: number;
  width_mm: number;
  gap_mm: number;
  thickness_mm: number;
  svg: string;
  material: MultiPolygon | null;
  /** גשרי הכיתוב שנחתכו, בקואורדינטות ה-`svg` שבשורה (0021). null = אין כיתוב,
   *  או שיתוף שנוצר לפני המיגרציה. */
  letter_bridges: LetterBridge[] | null;
  render_path: string | null;
  /** צילום ההדמיה התלת־ממדית (0014). קודם ל-render_path כתמונת השיתוף. */
  preview_path: string | null;
  serial: number | null;
  created_at: string;
  revoked_at: string | null;
  views: number;
  featured: boolean;
}

export type NewShare = Omit<
  ShareRow,
  "id" | "token" | "created_at" | "revoked_at" | "views" | "featured" | "preview_path"
>;

/**
 * מסד שעוד לא קיבל את המיגרציות של הטבלה. אותו טיפול כמו ב-orders: "הטבלה לא
 * קיימת" אינה תקלה אלא מיגרציה שלא רצה, ו-500 סתמי על זה שולח לחפש באג בקוד.
 *
 * שתי מיגרציות ולא אחת, כי אותה שגיאה עצמה מתקבלת גם על **עמודה** חסרה —
 * `letter_bridges` נוסף ב-0021, ומסד שקיבל רק את 0013 נופל כאן עם הודעה
 * שמצביעה על המיגרציה הלא נכונה.
 */
function fail(error: { message: string }): never {
  if (/does not exist|schema cache|relation .* does not exist/i.test(error.message)) {
    throw new ApiError(
      "schema_outdated",
      `Database is missing a design_shares migration (0013_design_shares / 0021_share_letter_bridges): ${error.message}`,
      503,
    );
  }
  throw new Error(error.message);
}

/**
 * השיתוף הפעיל של גרסה, אם קיים.
 *
 * שיתוף חוזר של אותו דבר מחזיר את אותו לינק: מי שלוחץ "שיתוף" פעמיים ציפה
 * לשתף עיצוב אחד, ושני לינקים שונים לאותה תוצאה הם שני דפים שסופרים צפיות
 * בנפרד ומבלבלים בדיוק את מי שמנסה לעקוב.
 */
export async function findActiveShare(
  designId: string,
  versionId: string | null,
): Promise<ShareRow | null> {
  let q = supabaseAdmin()
    .from("design_shares")
    .select("*")
    .eq("design_id", designId)
    .is("revoked_at", null);
  q = versionId ? q.eq("version_id", versionId) : q.is("version_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) fail(error);
  return (data as ShareRow) ?? null;
}

/**
 * יצירת שיתוף. הטוקן נוצר כאן ולא במסד כדי שהאקראיות תהיה של `crypto`.
 *
 * התנגשות על `token` היא הסתברותית ולא צפויה (2^70), אבל היא **כן** אפשרית על
 * `(design_id, version_id)` — שתי לחיצות מקבילות על "שיתוף". שתיהן צריכות
 * לקבל את אותו לינק, ולכן התנגשות שם נקראת חזרה במקום להיזרק.
 */
export async function createShare(input: NewShare): Promise<ShareRow> {
  const sb = supabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await sb
      .from("design_shares")
      .insert({ ...input, token: newShareToken() })
      .select("*")
      .single();
    if (!error && data) return data as ShareRow;
    if (!error || !/duplicate|unique/i.test(error.message)) fail(error ?? { message: "insert share failed" });

    // מרוץ על אותה גרסה — השיתוף שניצח הוא התשובה.
    const existing = await findActiveShare(input.design_id, input.version_id);
    if (existing) return existing;
  }
  throw new Error("Failed to allocate a share token");
}

/** השיתוף לפי הטוקן שבכתובת. שיתוף מבוטל נקרא כלא קיים. */
export async function getShareByToken(token: string): Promise<ShareRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("design_shares")
    .select("*")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) fail(error);
  return (data as ShareRow) ?? null;
}

/**
 * ספירת צפייה. עוברת דרך פונקציה במסד (0013) כדי שהתוספת תהיה אטומית — שני
 * מבקרים בו-זמנית הם המצב הרגיל בלינק שנשלח לקבוצה, לא הקצה.
 *
 * best-effort במכוון: הדף כבר עלה, וכשל בספירה אינו סיבה להחזיר שגיאה למי
 * שרק רצה לראות תכשיט.
 */
export async function bumpShareViews(id: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc("increment_share_views", { share_id: id });
  if (error) console.warn(`[shares] view count failed for ${id}: ${error.message}`);
}

/**
 * הצמדת צילום ההדמיה לשיתוף.
 *
 * נפרד מ-`createShare` כי הנתיב נגזר ממזהה השורה, שקיים רק אחריה. כשל כאן
 * אינו מבטל שיתוף: הלינק כבר תקין, ותמונת השיתוף נופלת ל-`render_path`.
 */
export async function attachSharePreview(id: string, path: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("design_shares")
    .update({ preview_path: path })
    .eq("id", id);
  if (error) console.warn(`[shares] preview attach failed for ${id}: ${error.message}`);
}

/** ביטול שיתוף. הלינק מפסיק לעבוד; השורה נשארת. */
export async function revokeShare(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("design_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(error);
}
