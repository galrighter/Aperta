import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import type { ProductType } from "@/lib/fabrication.config";

// חשבונות המשתמשים. יושבים ב-`profiles` — ראו את ההנמקה ב-0004_accounts.sql.

/**
 * שגיאת מסד → שגיאת API. הפרדה אחת חשובה: "העמודה לא קיימת" אינה תקלה אלא
 * מיגרציה שלא רצה, וזה בדיוק הכשל שכבר קרה כאן פעם — הפריסה ירוקה, ה-workflow
 * יוצא ב-exit 0 בלי ה-secret, והפיצ'ר מחזיר 500 שאי אפשר ללמוד ממנו כלום.
 * 503 עם קוד ייעודי אומר מה לעשות במקום להסתיר את זה.
 */
function fail(error: { message: string }): never {
  if (/does not exist|schema cache/i.test(error.message)) {
    throw new ApiError(
      "schema_outdated",
      "Database is missing migration 0004_accounts (accounts + design serial)",
      503,
    );
  }
  throw new Error(error.message);
}

export type AccountKind = "tester" | "friend";

export interface AccountRow {
  id: string;
  name: string;
  color: string;
  kind: AccountKind;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_seen_at: string;
}

/** מה שנשלח לדפדפן. בלי last_seen_at וחברותיה — הן לבק־אופיס. */
export interface PublicAccount {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export const toPublic = (a: AccountRow): PublicAccount => ({
  id: a.id,
  name: a.name,
  email: a.email ?? "",
  phone: a.phone,
});

// צבע לזיהוי מהיר ברשימת הבק־אופיס, נגזר מהמייל כדי שיהיה יציב בין הרצות.
const COLORS = ["#e05d5d", "#e0a04d", "#4da34d", "#4d8fe0", "#8a5de0", "#d05da8", "#3fa9a2", "#c2703a"];

function colorFor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** נירמול המייל — הוא מפתח הזהות, ולכן חייב צורה אחת בלבד. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function getAccount(id: string): Promise<AccountRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("id, name, color, kind, email, phone, created_at, last_seen_at")
    .eq("id", id)
    .maybeSingle();

  // מסד שעוד לא קיבל את 0004. הסטודיו הפנימי לא תלוי בעמודות החדשות ואין
  // סיבה להפיל אותו: שם כל פרופיל הוא בודק, וזה מה שהיה נכון גם קודם.
  // ההרשמה עצמה כן נופלת — ובקול, עם schema_outdated ולא עם 500.
  if (error && /does not exist|schema cache/i.test(error.message)) {
    const legacy = await sb.from("profiles").select("id, name, color").eq("id", id).maybeSingle();
    if (legacy.error || !legacy.data) return null;
    const row = legacy.data as { id: string; name: string; color: string };
    const never = new Date(0).toISOString();
    return { ...row, kind: "tester", email: null, phone: null, created_at: never, last_seen_at: never };
  }
  if (error) fail(error);
  return (data as AccountRow) ?? null;
}

/**
 * כניסה: חשבון קיים לפי מייל, או חדש. שם ששונה בטופס מעדכן את הקיים —
 * חבר שכותב את שמו אחרת בפעם השנייה מתכוון לאותו חשבון, לא לשני.
 */
export async function signIn(input: {
  name: string;
  email: string;
  phone?: string | null;
}): Promise<AccountRow> {
  const sb = supabaseAdmin();
  const email = normalizeEmail(input.email);
  const now = new Date().toISOString();

  const { data: existing, error: findErr } = await sb
    .from("profiles")
    .select("id, name, color, kind, email, phone, created_at, last_seen_at")
    .eq("email", email)
    .maybeSingle();
  if (findErr) fail(findErr);

  if (existing) {
    const patch: Record<string, unknown> = { last_seen_at: now, name: input.name };
    // טלפון ריק לא מוחק טלפון שכבר נמסר
    if (input.phone) patch.phone = input.phone;
    const { data, error } = await sb
      .from("profiles")
      .update(patch)
      .eq("id", (existing as AccountRow).id)
      .select("id, name, color, kind, email, phone, created_at, last_seen_at")
      .single();
    if (error) fail(error);
    return data as AccountRow;
  }

  const { data, error } = await sb
    .from("profiles")
    .insert({
      name: input.name,
      email,
      phone: input.phone || null,
      color: colorFor(email),
      kind: "friend",
      created_at: now,
      last_seen_at: now,
    })
    .select("id, name, color, kind, email, phone, created_at, last_seen_at")
    .single();
  if (error) {
    // מירוץ בין שתי לשוניות של אותו חבר — ההרשמה השנייה נופלת על ה-unique,
    // וזו הצלחה: החשבון קיים. שולפים אותו במקום להחזיר שגיאה.
    if (/duplicate|unique/i.test(error.message)) {
      const again = await sb
        .from("profiles")
        .select("id, name, color, kind, email, phone, created_at, last_seen_at")
        .eq("email", email)
        .maybeSingle();
      if (again.data) return again.data as AccountRow;
    }
    fail(error);
  }
  return data as AccountRow;
}

/* ===== בק־אופיס ===== */

export interface AdminDesignRow {
  id: string;
  serial: number | null;
  name: string;
  product_type: ProductType;
  length_mm: number;
  width_mm: number;
  gap_mm: number;
  created_at: string;
  updated_at: string;
  versions: number;
  /** ה-SVG של הגרסה הנוכחית, לתצוגה מקדימה. null אם היצירה לא הושלמה. */
  svg: string | null;
  owner: {
    id: string;
    name: string;
    color: string;
    kind: AccountKind;
    email: string | null;
    phone: string | null;
  } | null;
}

/**
 * העיצובים לבק־אופיס, החדש קודם, עם הבעלים ותצוגה מקדימה.
 *
 * שלוש שאילתות ולא אחת: PostgREST לא נותן "הגרסה האחרונה בלבד" בתוך embed,
 * ומשיכת כל הגרסאות של כל עיצוב מביאה עשרות SVG-ים שאיש לא מסתכל בהם.
 */
export async function listDesignsForAdmin(
  limit: number,
  offset: number,
): Promise<{ designs: AdminDesignRow[]; total: number }> {
  const sb = supabaseAdmin();

  const { data, error, count } = await sb
    .from("designs")
    .select(
      "id, serial, name, product_type, length_mm, width_mm, gap_mm, created_at, updated_at, current_version_id, profiles(id, name, color, kind, email, phone)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) fail(error);

  const rows = (data ?? []) as unknown as Array<
    Omit<AdminDesignRow, "versions" | "svg" | "owner"> & {
      current_version_id: string | null;
      profiles: AdminDesignRow["owner"];
    }
  >;
  if (rows.length === 0) return { designs: [], total: count ?? 0 };

  const designIds = rows.map((r) => r.id);
  const versionIds = rows.map((r) => r.current_version_id).filter((v): v is string => !!v);

  const [svgRes, countRes] = await Promise.all([
    versionIds.length
      ? sb.from("design_versions").select("id, svg").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    sb.from("design_versions").select("design_id").in("design_id", designIds),
  ]);
  if (svgRes.error) fail(svgRes.error);
  if (countRes.error) fail(countRes.error);

  const svgById = new Map((svgRes.data ?? []).map((v) => [v.id as string, v.svg as string]));
  const perDesign = new Map<string, number>();
  for (const v of countRes.data ?? []) {
    const k = (v as { design_id: string }).design_id;
    perDesign.set(k, (perDesign.get(k) ?? 0) + 1);
  }

  return {
    total: count ?? rows.length,
    designs: rows.map((r) => ({
      id: r.id,
      serial: r.serial,
      name: r.name,
      product_type: r.product_type,
      length_mm: Number(r.length_mm),
      width_mm: Number(r.width_mm),
      gap_mm: Number(r.gap_mm),
      created_at: r.created_at,
      updated_at: r.updated_at,
      versions: perDesign.get(r.id) ?? 0,
      svg: r.current_version_id ? (svgById.get(r.current_version_id) ?? null) : null,
      owner: r.profiles ?? null,
    })),
  };
}
