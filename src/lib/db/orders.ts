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
  price: Price | null;
  status: OrderStatus;
  status_history: Array<{ status: OrderStatus; at: string }>;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type NewOrder = Omit<
  OrderRow,
  "id" | "status" | "status_history" | "note" | "created_at" | "updated_at"
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

/** מספר ההזמנות מאותו מייל ב-24 השעות האחרונות (הגנת ספאם רכה, כמו בפניות). */
export async function countRecentOrdersFromEmail(email: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
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
 * `changed` נשאר בחוזה גם כשאיש לא צורך אותו: הוא התשובה ל"האם באמת קרה משהו",
 * וזה מה ש-D4.5 יצטרך כדי להחליט אם לשלוח הודעה ללקוחה.
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
    .select("*")
    .single();
  if (error) fail(error);
  return { order: data as OrderRow, changed: true };
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
