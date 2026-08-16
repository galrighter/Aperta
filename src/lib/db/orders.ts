import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import type { ProductType } from "@/lib/fabrication.config";
import type { Price } from "@/lib/pricing";

// שכבת הגישה ל-`orders` (migration 0011). service role בלבד.
//
// ההבדל מ-`inquiries` אינו טכני אלא של משמעות: פנייה נסגרת, הזמנה **מתקדמת**.
// לכן יש כאן צינור סטטוסים ולא שלושה מצבים, והיסטוריה של המעברים.

export type OrderStatus = "sent" | "approved" | "in_production" | "shipped" | "cancelled";
export type Fit = "tight" | "regular" | "loose";

/** הסדר שבו הזמנה מתקדמת. 'cancelled' יוצא מהצינור ואינו חלק ממנו. */
export const ORDER_PIPELINE: OrderStatus[] = ["sent", "approved", "in_production", "shipped"];
export const ORDER_STATUSES: OrderStatus[] = [...ORDER_PIPELINE, "cancelled"];

export interface OrderRow {
  id: string;
  ref: string | null;
  design_id: string | null;
  version_id: string | null;
  profile_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  product_type: ProductType | null;
  circumference_mm: number | null;
  width_mm: number | null;
  fit: Fit | null;
  cuts: number | null;
  brief: string | null;
  /**
   * 0022 — צילום המידות לייצור **ברגע ההזמנה**. עד כה הן נקראו מהשורה החיה של
   * העיצוב, שיכולה להשתנות אחרי ההזמנה. NULL בהזמנות שקדמו למיגרציה, ואז
   * `orderedDesignInfo` נופל לעיצוב כמו קודם.
   */
  length_mm: number | null;
  gap_mm: number | null;
  thickness_mm: number | null;
  price: Price | null;
  status: OrderStatus;
  status_history: Array<{ status: OrderStatus; at: string }>;
  note: string | null;
  /** 0020 — המפתח שמזהה ניסיון שליחה אחד. ראו `createOrderOnce`. */
  idempotency_key: string | null;
  /** 0020 — מתי אושרו התנאים. "אישרה" בלי "מתי" אינו ראיה. */
  terms_accepted_at: string | null;
  /** 0020 — הסכמה לדיוור, בנפרד מההזמנה עצמה. */
  marketing_opt_in: boolean;
  /** 0022 — מתי התקבל התשלום. חותמת ולא boolean, ואינו חלק מצינור הסטטוסים. */
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NewOrder = Omit<
  OrderRow,
  "id" | "status" | "status_history" | "note" | "paid_at" | "created_at" | "updated_at"
>;

/**
 * מסד שעוד לא קיבל את 0011. אותו טיפול כמו ב-accounts: "הטבלה לא קיימת" אינה
 * תקלה אלא מיגרציה שלא רצה, ו-500 סתמי על זה הוא בדיוק הכשל שכבר קרה כאן פעם.
 */
function fail(error: { message: string }): never {
  if (/does not exist|schema cache|relation .* does not exist/i.test(error.message)) {
    throw new ApiError("schema_outdated", "Database is missing migration 0011_orders", 503);
  }
  throw new Error(error.message);
}

export async function createOrder(input: NewOrder): Promise<OrderRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .insert({
      ...input,
      status: "sent",
      // ההיסטוריה נפתחת עם השליחה עצמה, אחרת "מתי היא נשלחה" קיים רק
      // ב-created_at ומעבר הסטטוס הראשון נראה כאילו הוא הראשון בכלל.
      status_history: [{ status: "sent", at: now }],
    })
    .select("*")
    .single();
  if (error) fail(error);
  return data as OrderRow;
}

/**
 * יצירה שרצה פעם אחת גם כשהיא נקראת פעמיים.
 *
 * הכפתור ננעל בזמן השליחה, וזה מטפל בלחיצה כפולה — אבל לא במה שקורה כשהתשובה
 * לא חוזרת: הלקוחה מקבלת "אפשר לנסות שוב", לוחצת, וההזמנה נשמרת פעמיים. אחר
 * כך אי אפשר לדעת מהשורות אם היא רצתה שתיים.
 *
 * המפתח נוצר פעם אחת למסך הצ'קאאוט ונשלח בכל ניסיון. שתי בדיקות ולא אחת:
 * חיפוש לפני ההוספה תופס את המקרה הרגיל, והתנגשות על האינדקס הייחודי (23505)
 * תופסת את שתי הבקשות שרצות ממש במקביל — שם החיפוש המקדים של שתיהן מחזיר
 * ריק. `created` הוא מה שאומר לקורא אם יש מה להודיע עליו: הזמנה שהוחזרה
 * מהמפתח כבר שלחה את המיילים שלה.
 */
export async function createOrderOnce(
  input: NewOrder,
): Promise<{ order: OrderRow; created: boolean }> {
  const key = input.idempotency_key;
  if (key) {
    const existing = await findOrderByKey(key);
    if (existing) return { order: existing, created: false };
  }

  try {
    return { order: await createOrder(input), created: true };
  } catch (err) {
    if (key && isUniqueViolation(err)) {
      const existing = await findOrderByKey(key);
      if (existing) return { order: existing, created: false };
    }
    throw err;
  }
}

async function findOrderByKey(key: string): Promise<OrderRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("*")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) fail(error);
  return (data as OrderRow) ?? null;
}

/**
 * בריחת תווי-דפוס ל-`ilike`. ‏`%` ו-`_` חוקיים בכתובת מייל, ובלי זה הם
 * הופכים את ההשוואה לחיפוש: `a_b@x.com` היה תופס גם את `axb@x.com`.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** התנגשות על אינדקס ייחודי, כפי ש-PostgREST מנסח אותה. */
function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate key value|23505/i.test(message);
}

/**
 * מספר ההזמנות מאותו מייל ב-24 השעות האחרונות (הגנת ספאם רכה, כמו בפניות).
 *
 * **ההשוואה מנורמלת.** ‏`.eq("email", email)` גולמי משווה מחרוזות, ולכן
 * `Dana@x.com` ו-`dana@x.com` הם שני דליים נפרדים — כלומר המכסה נעקפת
 * בשינוי אות אחת (docs/FULL_AUDIT_2026-08.md, פרק 3, ממצא 12). ‏`ilike`
 * ולא `eq` כי השורות הקיימות נשמרו כפי שהוקלדו; נרמול בכתיבה היה משנה מייל
 * של לקוחה, וזה שדה שמייל אישור נשלח אליו.
 *
 * ‏`escapeLike` — מייל יכול להכיל `%` או `_` (חוקי בהחלט), ובלי בריחה הם
 * הופכים לתווי חיפוש: `a_b@x.com` היה סופר גם את `axb@x.com`.
 */
export async function countRecentOrdersFromEmail(email: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .ilike("email", escapeLike(email.trim()))
    .gte("created_at", since);
  if (error) fail(error);
  return count ?? 0;
}

export async function listOrders(status?: OrderStatus): Promise<OrderRow[]> {
  let q = supabaseAdmin()
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) fail(error);
  return (data ?? []) as OrderRow[];
}

export async function getOrder(id: string): Promise<OrderRow> {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw new ApiError("not_found", "Order not found", 404);
  return data as OrderRow;
}

/**
 * מעבר סטטוס. ההיסטוריה נבנית מהשורה הקיימת ולא ב-SQL: `jsonb ||` היה חוסך
 * קריאה, אבל אנחנו צריכים לדעת מה היה הסטטוס הקודם — בחירה חוזרת באותו סטטוס
 * אינה מעבר, ורשומה כזאת בהיסטוריה היא רעש שנראה כמו אירוע.
 *
 * `changed` הוא התשובה ל"האם באמת קרה משהו", והוא מה שקובע אם יוצאת הודעה
 * ללקוחה: רענון או קליק כפול על אותו סטטוס לא מודיעים פעמיים.
 */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<{ order: OrderRow; changed: boolean }> {
  const before = await getOrder(id);
  if (before.status === status) return { order: before, changed: false };

  const now = new Date().toISOString();
  const history = [...(before.status_history ?? []), { status, at: now }];
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .update({ status, status_history: history, updated_at: now })
    .eq("id", id)
    // ההיסטוריה נבנתה מ-`before`, ולכן העדכון תקף רק כל עוד היא עדיין נכונה.
    // בלי התנאי הזה שני טאבים פתוחים על אותה הזמנה כותבים זה על זה: השני
    // שומר היסטוריה שנבנתה לפני המעבר הראשון, כלומר **מוחק רשומת מעבר** —
    // ושניהם שולחים מייל. עכשיו השני לא מוצא שורה, ומקבל תשובה שאומרת זאת.
    .eq("status", before.status)
    .select("*")
    .maybeSingle();
  if (error) fail(error);
  if (!data) {
    throw new ApiError(
      "status_conflict",
      "Order status changed elsewhere; reload and try again",
      409,
    );
  }
  return { order: data as OrderRow, changed: true };
}

/**
 * סימון תשלום (0022). לא מעבר סטטוס — הזמנה משולמת יכולה להיות בכל שלב
 * בצינור, ומה שמסומן כאן הוא עובדה חשבונאית ולא התקדמות בייצור.
 *
 * `at` נכתב בשרת. `null` מבטל סימון שנעשה בטעות — בלי זה הדרך היחידה לתקן
 * הייתה SQL ידני, וזו בדיוק הסיבה שאנשים לא מסמנים.
 */
export async function markOrderPaid(id: string, paid: boolean): Promise<OrderRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .update({ paid_at: paid ? now : null, updated_at: now })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw new ApiError("not_found", "Order not found", 404);
  return data as OrderRow;
}

/**
 * האם לעיצוב יש הזמנה שאינה מבוטלת.
 *
 * השאלה היחידה שעמדה בין לקוחה שמנקה את החשבון שלה לבין הזמנה משולמת בלי
 * קובץ חיתוך: ‏`design_versions` נמחק בקסקדה, ההזמנה עצמה שורדת עם
 * `design_id = null`, ומה שנשאר הוא רישום בלי SVG ובלי דרך לייצא אותו.
 *
 * `cancelled` אינה חוסמת — הזמנה שבוטלה אינה עומדת לייצור.
 */
export async function hasActiveOrderForDesign(designId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("design_id", designId)
    .neq("status", "cancelled");
  if (error) fail(error);
  return (count ?? 0) > 0;
}

/** הערה פנימית. לא נשלחת ללקוחה ואינה משנה סטטוס. */
export async function updateOrderNote(id: string, note: string | null): Promise<OrderRow> {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .update({ note, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail(error);
  return data as OrderRow;
}
