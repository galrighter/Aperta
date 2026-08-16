import { supabaseAdmin } from "./supabase";
import { escapeLike } from "./orders";

// שכבת הגישה לטבלת inquiries (פניות/הזמנות מאתר המותג). service role בלבד.

export type InquiryKind = "order" | "contact";
export type InquiryStatus = "new" | "contacted" | "closed";

export type Inquiry = {
  id: string;
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string | null;
  product_type: "bracelet" | "ring" | null;
  message: string;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
};

export type NewInquiry = {
  kind: InquiryKind;
  name: string;
  email: string;
  phone?: string | null;
  product_type?: "bracelet" | "ring" | null;
  message: string;
};

/**
 * מספר הפניות מאותו אימייל ב-24 השעות האחרונות (הגנת ספאם רכה).
 *
 * מנורמל, מאותה סיבה שב-`countRecentOrdersFromEmail`: השוואת מחרוזות גולמית
 * הופכת כל שינוי אות לדלי חדש, כלומר למכסה שנעקפת בלי מאמץ.
 */
export async function countRecentFromEmail(email: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .ilike("email", escapeLike(email.trim()))
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function createInquiry(input: NewInquiry): Promise<Inquiry> {
  const { data, error } = await supabaseAdmin()
    .from("inquiries")
    .insert({
      kind: input.kind,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      product_type: input.product_type ?? null,
      message: input.message,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Inquiry;
}

export async function listInquiries(
  status?: InquiryStatus,
  kind?: InquiryKind,
): Promise<Inquiry[]> {
  let q = supabaseAdmin()
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) q = q.eq("status", status);
  // הזמנה ופנייה חיות באותה טבלה, ורק `kind` מבדיל ביניהן. בלי הסינון הזה
  // "הזמנות שבוצעו בפועל" הוא משהו שצריך לזהות בעין בתוך רשימה מעורבת.
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Inquiry[];
}

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<Inquiry> {
  const { data, error } = await supabaseAdmin()
    .from("inquiries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Inquiry;
}
