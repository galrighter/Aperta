import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import type { ProductType } from "@/lib/fabrication.config";

// חשבונות המשתמשים. יושבים ב-`profiles` — ראו את ההנמקה ב-0008_accounts.sql.

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
      "Database is missing migration 0008_accounts (accounts + design serial)",
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
  /**
   * הכתובת האחרונה שנמסרה (0020). אופציונליות ולא `| null` בלבד: מסלול
   * הכניסה (`linkAuthUser`) אינו שולף אותן, ומסד שעוד לא קיבל את 0020 אינו
   * מחזיק אותן. `undefined` כאן פירושו "לא נשאלנו", ולא "אין כתובת".
   */
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  created_at: string;
  last_seen_at: string;
}

/** מה שנשלח לדפדפן. בלי last_seen_at וחברותיה — הן לבק־אופיס. */
export interface PublicAccount {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
}

export const toPublic = (a: AccountRow): PublicAccount => ({
  id: a.id,
  name: a.name,
  email: a.email ?? "",
  phone: a.phone,
  street: a.street ?? null,
  city: a.city ?? null,
  zip: a.zip ?? null,
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

/** 0008 ומעלה. הכתובת (0020) נוספת עליהן, ונשמטת אם המסד עוד לא קיבל אותה. */
const ACCOUNT_COLS = "id, name, color, kind, email, phone, created_at, last_seen_at";
const ACCOUNT_COLS_ADDR = `${ACCOUNT_COLS}, street, city, zip`;

const missingColumn = (message: string) => /does not exist|schema cache/i.test(message);

export async function getAccount(id: string): Promise<AccountRow | null> {
  const sb = supabaseAdmin();
  let { data, error } = await sb
    .from("profiles")
    .select(ACCOUNT_COLS_ADDR)
    .eq("id", id)
    .maybeSingle();

  // מסד שעוד לא קיבל את 0020. הכתובת השמורה היא נוחות — היעדרה מחזיר טופס
  // ריק, ולא מפיל את הזהות של מי שכבר מחובר. שאר החשבון נקרא כרגיל.
  if (error && missingColumn(error.message)) {
    ({ data, error } = await sb.from("profiles").select(ACCOUNT_COLS).eq("id", id).maybeSingle());
  }

  // מסד שעוד לא קיבל את 0008. הסטודיו הפנימי לא תלוי בעמודות החדשות ואין
  // סיבה להפיל אותו: שם כל פרופיל הוא בודק, וזה מה שהיה נכון גם קודם.
  // ההרשמה עצמה כן נופלת — ובקול, עם schema_outdated ולא עם 500.
  if (error && missingColumn(error.message)) {
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
 * קישור בין משתמש מאומת (`auth.users`) לפרופיל.
 *
 * שלושה צעדים, ובסדר הזה:
 * 1. לפי `auth_user_id` — הכניסה השנייה ואילך.
 * 2. לפי המייל — **חשבון שנוצר בבטא, לפני שהייתה כניסה מאומתת.** זה הצעד
 *    שמונע מחבר שכבר עיצב לאבד את כל העיצובים שלו ברגע שהזיהוי נעשה אמיתי,
 *    והוא היחיד כאן שאי אפשר לתקן בדיעבד: אם ניצור לו פרופיל שני, העיצובים
 *    יישארו תלויים בראשון בלי דרך להגיע אליהם.
 * 3. אחרת — פרופיל חדש.
 *
 * המייל מגיע מ-`auth.users` ולא מטופס, ולכן הוא מאומת: או שנשלח אליו קוד, או
 * שגוגל אישרה אותו — ולא מטופס, כפי שהיה בבטא.
 */
export async function linkAuthUser(input: {
  authUserId: string;
  email: string;
  /** השם שגוגל מסרה, כשיש. במסלול המייל אין שם עד שהמשתמש ימלא אותו. */
  name?: string | null;
}): Promise<AccountRow> {
  const sb = supabaseAdmin();
  const email = normalizeEmail(input.email);
  const now = new Date().toISOString();
  const COLS = "id, name, color, kind, email, phone, created_at, last_seen_at";

  const linked = await sb.from("profiles").select(COLS).eq("auth_user_id", input.authUserId).maybeSingle();
  if (linked.error) fail(linked.error);
  if (linked.data) {
    const row = linked.data as AccountRow;
    // המסלול הזה רץ בכל בקשה מאומתת. כתיבה בכל פעם היא כתיבה למסד על כל
    // לחיצה, בשביל שדה שמדויק עד כדי שעה ממילא.
    const stale = Date.now() - new Date(row.last_seen_at).getTime() > 60 * 60 * 1000;
    if (stale) await sb.from("profiles").update({ last_seen_at: now }).eq("id", row.id);
    return row;
  }

  const byEmail = await sb.from("profiles").select(COLS).eq("email", email).maybeSingle();
  if (byEmail.error) fail(byEmail.error);
  if (byEmail.data) {
    const existing = byEmail.data as AccountRow;
    const patch: Record<string, unknown> = { auth_user_id: input.authUserId, last_seen_at: now };
    // שם קיים לא נדרס בשם מגוגל: מי שכתב לעצמו "דנה כ." התכוון לזה.
    if (input.name && !existing.name) patch.name = input.name;
    const { data, error } = await sb.from("profiles").update(patch).eq("id", existing.id).select(COLS).single();
    if (error) fail(error);
    return data as AccountRow;
  }

  const { data, error } = await sb
    .from("profiles")
    .insert({
      name: input.name || email.split("@")[0],
      email,
      color: colorFor(email),
      kind: "friend",
      auth_user_id: input.authUserId,
      created_at: now,
      last_seen_at: now,
    })
    .select(COLS)
    .single();
  if (error) {
    // מירוץ בין שתי לשוניות — ההרשמה השנייה נופלת על ה-unique, וזו הצלחה.
    if (/duplicate|unique/i.test(error.message)) {
      const again = await sb.from("profiles").select(COLS).eq("email", email).maybeSingle();
      if (again.data) return again.data as AccountRow;
    }
    fail(error);
  }
  return data as AccountRow;
}

/**
 * השלמת פרטים אחרי הכניסה הראשונה, ואחרי כל הזמנה: שם, טלפון וכתובת.
 *
 * הכתובת נשמרת כאן כדי שההזמנה הבאה תתחיל ממה שכבר נמסר. הצילום ב-`orders`
 * נשאר בשלו — הוא של ההזמנה ההיא, ושינוי כאן אינו משנה לאן נשלח מה שכבר נשלח.
 *
 * שדה ריק אינו מוחק ערך קיים בשום מקרה: הטופס יכול להישלח חלקי, ו"לא נמסר
 * הפעם" אינו "בטלי את מה שנמסר".
 */
export async function updateAccountDetails(
  id: string,
  patch: { name?: string; phone?: string | null; street?: string; city?: string; zip?: string },
): Promise<AccountRow> {
  const update: Record<string, unknown> = {};
  if (patch.name) update.name = patch.name;
  if (patch.phone) update.phone = patch.phone;
  const address = { street: patch.street, city: patch.city, zip: patch.zip };
  for (const [k, v] of Object.entries(address)) if (v) update[k] = v;

  if (Object.keys(update).length === 0) {
    const cur = await supabaseAdmin().from("profiles").select(ACCOUNT_COLS_ADDR).eq("id", id).single();
    if (cur.error) fail(cur.error);
    return cur.data as AccountRow;
  }
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .update(update)
    .eq("id", id)
    .select(ACCOUNT_COLS_ADDR)
    .single();
  if (error) fail(error);
  return data as AccountRow;
}

/* ===== בק־אופיס ===== */

export interface AdminDesignRow {
  id: string;
  serial: number | null;
  /** 0018 — ראו designSampleCode(). מלאים רק כשהעיצוב הוא דוגמה שנוצרה בשכפול. */
  root_serial: number | null;
  sample_no: number | null;
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
      "id, serial, root_serial, sample_no, name, product_type, length_mm, width_mm, gap_mm, created_at, updated_at, current_version_id, profiles(id, name, color, kind, email, phone)",
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
      root_serial: r.root_serial,
      sample_no: r.sample_no,
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
