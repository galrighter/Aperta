import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import type { ProductType } from "@/lib/fabrication.config";
import type { ReferralRule } from "@/lib/pricing";

// שכבת הגישה ל-`referral_codes` (migration 0026). service role בלבד.
//
// קוד הפניה הוא מחיר, ולכן כל מה שכאן נשאל **בשרת**. הדפדפן אף פעם לא מקבל
// את רשימת הקודים ולא את הכלל שמאחוריהם — הוא שולח מחרוזת ומקבל תשובה על
// אותה מחרוזת בלבד. אחרת "לא להזיל את המוצר" הופך לשאלה של מי פתח devtools.

export type ReferralKind = "fixed_price" | "percent_off";

export interface ReferralCodeRow {
  id: string;
  code: string;
  /** רישום פנימי: "חברים ומשפחה", "תכשיטי אלמוג — הרצליה". */
  label: string;
  /** מה שהלקוחה רואה כשהקוד נקלט. NULL — הנוסח הגנרי מ-i18n. */
  public_label: string | null;
  kind: ReferralKind;
  base_prices: Record<ProductType, number> | null;
  percent_off: number | null;
  max_uses: number | null;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * מסד שעוד לא קיבל את 0026 — אותו טיפול כמו ב-`orders`: "הטבלה לא קיימת" היא
 * מיגרציה שלא רצה, ולא 500 סתמי.
 */
function fail(error: { message: string }): never {
  if (/does not exist|schema cache|relation .* does not exist/i.test(error.message)) {
    throw new ApiError("schema_outdated", "Database is missing migration 0026_referral_codes", 503);
  }
  throw new Error(error.message);
}

/**
 * הצורה שבה קוד נשמר ומושווה: אותיות גדולות, בלי רווחים, מקפים אחידים.
 *
 * מה שמנורמל כאן הוא מה שאנשים באמת מקלידים. קוד עובר בוואטסאפ ובעל־פה, וחוזר
 * עם רווח בסוף מהעתקה, עם רישיות של המקלדת, ולפעמים עם מקף "יפה" (–/־) שאיש
 * לא התכוון אליו — שלושתם קוד תקין שהמסך היה דוחה ב"לא נמצא", וזו התקלה שאין
 * ממנה דרך חזרה כי הלקוחה לא יודעת מה לתקן.
 */
export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    // מקפים טיפוגרפיים (en/em/מקף עברי) ← מקף ASCII.
    .replace(/[‐-―־]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** הכלל שהקוד מייצג, בצורה ש-`priceFor` יודע לקרוא. */
export function ruleOf(row: ReferralCodeRow): ReferralRule | null {
  if (row.kind === "fixed_price") {
    return row.base_prices ? { kind: "fixed_price", basePrices: row.base_prices } : null;
  }
  return row.percent_off != null
    ? { kind: "percent_off", percentOff: Number(row.percent_off) }
    : null;
}

export async function findReferralCode(raw: string): Promise<ReferralCodeRow | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const { data, error } = await supabaseAdmin()
    .from("referral_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) fail(error);
  return (data as ReferralCodeRow) ?? null;
}

/**
 * כמה מקומות נתפסו בקוד.
 *
 * **הזמנה מבוטלת אינה תופסת מקום.** אחרת טעות הקלדה בכתובת, או לקוחה
 * שהתחרטה, היו אוכלות אחד מ-25 המקומות לתמיד — וגל היה מגלה את זה כשהקוד
 * נגמר מוקדם מהצפוי, בלי דרך להבין למה.
 */
export async function countCodeUses(codeId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("referral_code_id", codeId)
    .neq("status", "cancelled");
  if (error) fail(error);
  return count ?? 0;
}

/** למה קוד נדחה. כל ערך כאן הוא הודעה נפרדת ללקוחה — ראו `he.design.referral`. */
export type ReferralRejection = "not_found" | "inactive" | "expired" | "exhausted" | "misconfigured";

export type ReferralResolution =
  | { ok: true; row: ReferralCodeRow; rule: ReferralRule; remaining: number | null }
  | { ok: false; reason: ReferralRejection };

/**
 * הקוד, אם אפשר להשתמש בו עכשיו.
 *
 * **סיבה מפורשת לכל דחייה, ולא "לא תקין".** קוד שפג ("הקוד הזה כבר לא בתוקף")
 * וקוד שהמכסה שלו נגמרה ("כל המקומות נתפסו") הם שתי שיחות שונות לגמרי עם
 * הלקוחה, ורק אחת מהן היא שגיאה שלה. ההודעה הגנרית מייצרת פנייה בוואטסאפ בכל
 * אחד מהמקרים.
 *
 * **הבדיקה הזאת חוזרת בשליחת ההזמנה ואינה נסמכת על מסך הצ'קאאוט.** בין
 * הוולידציה לשליחה יכולות לחלוף דקות — ובזמן הזה הקוד יכול להיגמר, לפוג, או
 * להיכבות בבק־אופיס.
 */
export async function resolveReferralCode(raw: string): Promise<ReferralResolution> {
  const row = await findReferralCode(raw);
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.active) return { ok: false, reason: "inactive" };
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const rule = ruleOf(row);
  // קוד שעבר את ה-check constraint של 0026 לא אמור להגיע לכאן בלי כלל. אם
  // הגיע — עדיף לדחות אותו מאשר לתמחר לפי ברירת מחדל שאיש לא בחר.
  if (!rule) return { ok: false, reason: "misconfigured" };

  let remaining: number | null = null;
  if (row.max_uses != null) {
    const used = await countCodeUses(row.id);
    remaining = Math.max(0, row.max_uses - used);
    if (remaining <= 0) return { ok: false, reason: "exhausted" };
  }

  return { ok: true, row, rule, remaining };
}

/* ===== בק־אופיס ===== */

export interface ReferralCodeWithUsage extends ReferralCodeRow {
  used: number;
  remaining: number | null;
}

/**
 * הקודים והשימוש בהם. שאילתת ספירה אחת לכל קוד — הרשימה הזאת נמדדת בעשרות
 * ונקראת רק בבק־אופיס, ו-view עם join היה קונה כאן מורכבות שאין לה לקוח.
 */
export async function listReferralCodes(): Promise<ReferralCodeWithUsage[]> {
  const { data, error } = await supabaseAdmin()
    .from("referral_codes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) fail(error);
  const rows = (data ?? []) as ReferralCodeRow[];
  return Promise.all(
    rows.map(async (row) => {
      const used = await countCodeUses(row.id);
      return { ...row, used, remaining: row.max_uses == null ? null : Math.max(0, row.max_uses - used) };
    }),
  );
}

export type NewReferralCode = Pick<
  ReferralCodeRow,
  "code" | "label" | "public_label" | "kind" | "base_prices" | "percent_off" | "max_uses" | "expires_at" | "note"
>;

export async function createReferralCode(input: NewReferralCode): Promise<ReferralCodeRow> {
  const { data, error } = await supabaseAdmin()
    .from("referral_codes")
    .insert({ ...input, code: normalizeCode(input.code) })
    .select("*")
    .single();
  if (error) {
    // קוד קיים הוא טעות אנוש שקורית (אותו שם חנות פעמיים), ולא תקלה.
    if (/duplicate key value|23505/i.test(error.message)) {
      throw new ApiError("code_exists", "A referral code with this value already exists", 409);
    }
    // ה-check constraints של 0026 הם ההגנה האמיתית על המחיר. כשאחד מהם נופל,
    // מה שנשלח הוא קוד שהיה מתמחר לבד — וזו שגיאת קלט, לא 500.
    if (/violates check constraint|23514/i.test(error.message)) {
      throw new ApiError("invalid_code", "The code definition is not valid", 400);
    }
    fail(error);
  }
  return data as ReferralCodeRow;
}

export async function setReferralCodeActive(id: string, active: boolean): Promise<ReferralCodeRow> {
  const { data, error } = await supabaseAdmin()
    .from("referral_codes")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail(error);
  if (!data) throw new ApiError("not_found", "Referral code not found", 404);
  return data as ReferralCodeRow;
}
