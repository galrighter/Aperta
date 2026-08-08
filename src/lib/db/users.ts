import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";
import type { AccountKind } from "./accounts";
import type { InquiryKind, InquiryStatus } from "./inquiries";
import type { OrderStatus } from "./orders";
import type { VersionRow } from "./designs";
import type { ProductType } from "@/lib/fabrication.config";
import { designSampleCode } from "@/lib/designCode";

// "מי נרשם, ומה הוא עשה" — שכבת הגישה של לשונית המשתמשים בבק־אופיס.
//
// **למה מודול נפרד מ-`accounts`.** `accounts` הוא מסלול המשתמש: קישור זהות,
// עדכון פרטים, והרשימה של "מי עיצב מה". כאן הכיוון הפוך — הישות היא המשתמש,
// והשאלה היא מה קרה אצלו. זה מושך משבעה מקורות שאין ביניהם קשר במסלול המשתמש
// (`designs`, `design_versions`, `generation_runs`, `orders`, `inquiries`,
// `exports`, `design_shares`), ואין סיבה שכל אחד מהם ייכנס לתלויות של המסלול
// שרק מקשר משתמש לפרופיל.
//
// **מה קושר אירוע למשתמש.** שני חוטים בלבד, ובכוונה:
//   · `profile_id` — מה שנעשה מתוך חשבון (עיצובים, וממילא כל הגרסאות,
//     ההרצות, הייצוא והשיתופים שתלויים בהם; והזמנות).
//   · המייל — מה שנעשה בטופס בלי חשבון: פניות (ל-`inquiries` אין `profile_id`
//     בכלל), והזמנה שנשלחה לפני שהמשתמש התחבר. המייל הוא מפתח הזהות של החשבון
//     (`accounts.normalizeEmail`), ולכן הוא מפתח חוקי גם כאן.
//
// מה שאין לו אף אחד מהשניים אינו מוצג כאן — ובראשו הרצה בלי `design_id`
// (מעבדת הבק־אופיס והמרת תמונה ידנית). היא קיימת ביומן ההרצות, ואין דרך לומר
// למי היא שייכת; לנחש אותה למשתמש היה גרוע מלא להציג אותה.

/**
 * שגיאת מסד → שגיאת API. אותה הפרדה כמו ב-`accounts`: "העמודה לא קיימת" אינה
 * תקלה אלא מיגרציה שלא רצה, ו-503 עם קוד ייעודי אומר מה לעשות במקום 500 סתמי.
 */
function fail(error: { message: string }): never {
  if (/does not exist|schema cache/i.test(error.message)) {
    throw new ApiError(
      "schema_outdated",
      "Database is missing migration 0008_accounts (accounts columns on profiles)",
      503,
    );
  }
  throw new Error(error.message);
}

/* ===== הרשימה ===== */

/** לפי מה ממיינים: תאריך ההרשמה, או הפעילות האחרונה. */
export type UserSort = "created" | "active";

export const USER_SORTS: UserSort[] = ["created", "active"];

const SORT_COLUMN: Record<UserSort, "created_at" | "last_seen_at"> = {
  created: "created_at",
  active: "last_seen_at",
};

export interface AdminUserRow {
  id: string;
  name: string;
  color: string;
  kind: AccountKind;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_seen_at: string;
  /** כמה עיצובים יש לו. */
  designs: number;
  /** כמה הזמנות נשלחו מהחשבון הזה. */
  orders: number;
}

const USER_COLUMNS = "id, name, color, kind, email, phone, created_at, last_seen_at";

/**
 * ניקוי מונח החיפוש.
 *
 * `or` של PostgREST הוא מחרוזת עם תחביר משלה — פסיק מפריד בין תנאים, סוגריים
 * מקבצים, וכוכבית היא התו הכללי. ערך שמכיל אותם אינו "חיפוש שלא מוצא" אלא
 * **שאילתה אחרת**, ולכן הם מנוקים כאן ולא נסמכים על מי שיקרא לפונקציה. `%`
 * בחוץ מאותה סיבה: הוא התו הכללי של `ilike` עצמו.
 */
export function searchTerm(raw: string): string | null {
  const clean = raw
    .trim()
    .replace(/[,()"'\\*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 0 ? clean : null;
}

/**
 * כמה שורות יש לכל אחד מהמזהים, בשאילתה אחת לטבלה.
 *
 * שאילתה אחת ולא `count` לכל משתמש בנפרד: עמוד של 25 משתמשים היה 25 בקשות
 * רשת. best-effort — טבלה שהמיגרציה שלה עוד לא רצה (`orders`, 0011) מחזירה
 * מפה ריקה ולא מפילה את הרשימה.
 */
async function countByProfile(table: string, ids: string[]): Promise<Map<string, number>> {
  const tally = new Map<string, number>();
  if (ids.length === 0) return tally;
  try {
    const { data, error } = await supabaseAdmin()
      .from(table)
      .select("profile_id")
      .in("profile_id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ profile_id: string | null }>) {
      if (!row.profile_id) continue;
      tally.set(row.profile_id, (tally.get(row.profile_id) ?? 0) + 1);
    }
  } catch (e) {
    console.error(`user ${table} count failed:`, (e as Error).message);
  }
  return tally;
}

export interface ListUsersOptions {
  /** חיפוש חופשי בשם, במייל ובטלפון. */
  q?: string | null;
  sort?: UserSort;
  /** `friend` = נרשם באתר, `tester` = אחד מששת הבודקים של הסטודיו. */
  kind?: AccountKind | null;
  limit: number;
  offset: number;
}

export async function listUsersForAdmin(
  opts: ListUsersOptions,
): Promise<{ users: AdminUserRow[]; total: number }> {
  const sb = supabaseAdmin();
  const sort = opts.sort ?? "created";

  let query = sb.from("profiles").select(USER_COLUMNS, { count: "exact" });
  if (opts.kind) query = query.eq("kind", opts.kind);
  const term = opts.q ? searchTerm(opts.q) : null;
  if (term) query = query.or(`name.ilike.*${term}*,email.ilike.*${term}*,phone.ilike.*${term}*`);

  const { data, error, count } = await query
    // `id` כשובר שוויון: `created_at` הוא ברירת מחדל ברמת השנייה ועשוי לחזור
    // על עצמו, ובלי סדר יציב עימוד לפי `offset` מדלג על שורה או מכפיל אותה.
    .order(SORT_COLUMN[sort], { ascending: false })
    .order("id", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) fail(error);

  const rows = (data ?? []) as Array<Omit<AdminUserRow, "designs" | "orders">>;
  if (rows.length === 0) return { users: [], total: count ?? 0 };

  const ids = rows.map((r) => r.id);
  const [designs, orders] = await Promise.all([
    countByProfile("designs", ids),
    countByProfile("orders", ids),
  ]);

  return {
    total: count ?? rows.length,
    users: rows.map((r) => ({
      ...r,
      designs: designs.get(r.id) ?? 0,
      orders: orders.get(r.id) ?? 0,
    })),
  };
}

/* ===== הפעילות של משתמש אחד ===== */

/** סוג האירוע ביומן הפעילות. */
export type ActivityKind =
  | "design_created"
  | "version"
  | "run_failed"
  | "order"
  | "inquiry"
  | "export"
  | "share";

/** העיצוב שהאירוע נוגע בו — בייצוג שאומרים בקול (`AP-0085.2`). */
export interface ActivityDesign {
  id: string;
  code: string | null;
  name: string;
  product_type: ProductType;
}

export interface ActivityEvent {
  /** ייחודי בין כל המקורות: `<kind>:<id של השורה>`. */
  id: string;
  kind: ActivityKind;
  at: string;
  design: ActivityDesign | null;
  /** `version` — איזו גרסה נשמרה, ואיך היא נוצרה. */
  version?: { no: number; source: VersionRow["source"]; status: VersionRow["validation_status"] };
  /** `run_failed` — דחייה בשער (`rejected`) או כשל טכני (`error`). */
  run?: { status: "rejected" | "error"; error: string | null; prompt: string | null };
  /** `order` — הרפרנס, הסטטוס והסכום. */
  order?: { id: string; ref: string | null; status: OrderStatus; total: number | null };
  /** `inquiry` — פנייה מהאתר. אין לה `profile_id`, והחוט אליה הוא המייל. */
  inquiry?: { id: string; kind: InquiryKind; status: InquiryStatus; message: string };
  /** `export` — הורדת קבצי ייצור. `forced` = ייצוא שאושר למרות אזהרות. */
  exported?: { forced: boolean };
  /** `share` — לינק שיתוף שנוצר. */
  share?: { token: string; revoked: boolean; views: number };
}

/**
 * הספירות של המשתמש.
 *
 * נמדדות מול הטבלאות ולא נספרות מתוך רשימת האירועים: הרשימה מקוצצת ב-`limit`,
 * ולספור אותה היה אומר ש"12 יצירות שנכשלו" הופך ל-3 ברגע שהיומן ארוך.
 */
export interface UserCounts {
  designs: number;
  versions: number;
  /** גרסאות שנוצרו בעריכה (`source = 'edit'`), מתוך `versions`. */
  edits: number;
  failedRuns: number;
  orders: number;
  inquiries: number;
  exports: number;
  shares: number;
}

export interface UserActivity {
  user: AdminUserRow;
  counts: UserCounts;
  /** האירועים, החדש קודם. */
  events: ActivityEvent[];
  /** יש עוד אירועים מעבר למה שהוחזר — הרשימה נחתכה ב-`limit`. */
  truncated: boolean;
  /**
   * הספירות התלויות-עיצוב מדברות על `MAX_DESIGNS` העיצובים האחרונים בלבד.
   * נאמר במפורש ולא נבלע: מספר שמתאר חלק ומוצג כשלם הוא מספר שגוי.
   */
  designsTruncated: boolean;
  /**
   * מקורות שלא נטענו (שם הטבלה). מוחזר ולא נבלע: רשימה חסרה שנראית שלמה היא
   * בדיוק מה שגורם להסיק "הוא לא הזמין כלום" ממקור שפשוט נפל.
   */
  problems: string[];
}

/**
 * כמה עיצובים נמשכים כדי לקשור אליהם את שאר המקורות.
 *
 * הגרסאות, ההרצות, הייצוא והשיתופים אינם נושאים `profile_id` — הם תלויים
 * בעיצוב, ולכן כל שאילתה עליהם היא `in (design ids)`. רשימת מזהים ארוכה היא
 * כתובת ארוכה, ולכן יש לה תקרה: 200 מזהים הם כ-8KB של פילטר.
 */
const MAX_DESIGNS = 200;

/** תקרת האירועים בתשובה אחת. */
export const DEFAULT_EVENT_LIMIT = 200;
export const MAX_EVENT_LIMIT = 500;

type Result<T> = { data: T[] | null; error: { message: string } | null };
type CountResult = { count: number | null; error: { message: string } | null };

/** מקור שנפל אינו מפיל את העמוד — הוא נרשם ומדווח. */
async function rows<T>(
  name: string,
  problems: string[],
  run: () => PromiseLike<Result<unknown>>,
): Promise<T[]> {
  try {
    const { data, error } = await run();
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  } catch (e) {
    console.error(`user activity: ${name} failed:`, (e as Error).message);
    problems.push(name);
    return [];
  }
}

/** ספירה מדויקת בלי להביא שורות (`head: true`). */
async function headCount(
  name: string,
  problems: string[],
  run: () => PromiseLike<CountResult>,
): Promise<number> {
  try {
    const { count, error } = await run();
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch (e) {
    console.error(`user activity: ${name} count failed:`, (e as Error).message);
    problems.push(name);
    return 0;
  }
}

const ORDER_COLUMNS = "id, ref, design_id, status, price, created_at";

interface OrderSourceRow {
  id: string;
  ref: string | null;
  design_id: string | null;
  status: OrderStatus;
  price: { total?: number } | null;
  created_at: string;
}

interface DesignSourceRow {
  id: string;
  serial: number | null;
  root_serial: number | null;
  sample_no: number | null;
  name: string;
  product_type: ProductType;
  created_at: string;
}

interface VersionSourceRow {
  id: string;
  design_id: string;
  version_no: number;
  source: VersionRow["source"];
  validation_status: VersionRow["validation_status"];
  created_at: string;
}

interface RunSourceRow {
  id: string;
  design_id: string;
  status: "rejected" | "error";
  error: string | null;
  prompt: string | null;
  created_at: string;
}

interface InquirySourceRow {
  id: string;
  kind: InquiryKind;
  status: InquiryStatus;
  message: string;
  created_at: string;
}

interface ExportSourceRow {
  id: string;
  design_id: string;
  forced: boolean;
  created_at: string;
}

interface ShareSourceRow {
  id: string;
  design_id: string;
  token: string;
  revoked_at: string | null;
  views: number;
  created_at: string;
}

/**
 * המשתמש, הספירות שלו, והאירועים שלו — החדש קודם. `null` = אין פרופיל כזה.
 *
 * `limit` חותך את **רשימת האירועים** בלבד; הספירות נמדדות בנפרד.
 */
export async function getUserActivity(
  id: string,
  limit = DEFAULT_EVENT_LIMIT,
): Promise<UserActivity | null> {
  const sb = supabaseAdmin();
  const problems: string[] = [];
  const cap = Math.min(MAX_EVENT_LIMIT, Math.max(1, limit));

  const profile = await sb.from("profiles").select(USER_COLUMNS).eq("id", id).maybeSingle();
  if (profile.error) fail(profile.error);
  if (!profile.data) return null;
  const user = profile.data as Omit<AdminUserRow, "designs" | "orders">;
  const email = user.email;

  // העיצובים קודם: הם גם אירוע בפני עצמו וגם המפתח לכל שאר המקורות.
  const designRows = await rows<DesignSourceRow>("designs", problems, () =>
    sb
      .from("designs")
      .select("id, serial, root_serial, sample_no, name, product_type, created_at")
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_DESIGNS),
  );
  const designIds = designRows.map((d) => d.id);
  const hasDesigns = designIds.length > 0;
  const designById = new Map<string, ActivityDesign>(
    designRows.map((d) => [
      d.id,
      { id: d.id, code: designSampleCode(d), name: d.name, product_type: d.product_type },
    ]),
  );

  /** רק כשיש עיצובים: `in ()` ריק הוא שאילתה מיותרת שמחזירה כלום. */
  const perDesign = <T>(run: () => Promise<T>, fallback: T): Promise<T> =>
    hasDesigns ? run() : Promise.resolve(fallback);

  const [
    versions,
    failedRuns,
    ownedOrders,
    emailOrders,
    inquiries,
    exports,
    shares,
    designCount,
    versionCount,
    editCount,
    failedRunCount,
  ] = await Promise.all([
    perDesign(
      () =>
        rows<VersionSourceRow>("design_versions", problems, () =>
          sb
            .from("design_versions")
            .select("id, design_id, version_no, source, validation_status, created_at")
            .in("design_id", designIds)
            .order("created_at", { ascending: false })
            .limit(cap),
        ),
      [] as VersionSourceRow[],
    ),
    perDesign(
      () =>
        rows<RunSourceRow>("generation_runs", problems, () =>
          sb
            .from("generation_runs")
            .select("id, design_id, status, error, prompt, created_at")
            .in("design_id", designIds)
            // "נכשל" = כל מה שאינו `approved`: גם דחייה בשער וגם שגיאה טכנית.
            // אותה הגדרה בדיוק כמו ביומן ההרצות, כדי ששני המסכים לא יספרו אחרת.
            .neq("status", "approved")
            .order("created_at", { ascending: false })
            .limit(cap),
        ),
      [] as RunSourceRow[],
    ),
    rows<OrderSourceRow>("orders", problems, () =>
      sb
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(cap),
    ),
    // הזמנה שנשלחה לפני שהמשתמש התחבר נושאת מייל ולא `profile_id`. שתי
    // שאילתות ואיחוד לפי מזהה, ולא `or` אחד: המייל היה נכנס אז לתוך מחרוזת
    // הפילטר של PostgREST, ותו תחביר בכתובת מייל הוא שאילתה אחרת.
    email
      ? rows<OrderSourceRow>("orders", problems, () =>
          sb
            .from("orders")
            .select(ORDER_COLUMNS)
            .eq("email", email)
            .order("created_at", { ascending: false })
            .limit(cap),
        )
      : Promise.resolve([] as OrderSourceRow[]),
    email
      ? rows<InquirySourceRow>("inquiries", problems, () =>
          sb
            .from("inquiries")
            .select("id, kind, status, message, created_at")
            .eq("email", email)
            .order("created_at", { ascending: false })
            .limit(cap),
        )
      : Promise.resolve([] as InquirySourceRow[]),
    perDesign(
      () =>
        rows<ExportSourceRow>("exports", problems, () =>
          sb
            .from("exports")
            .select("id, design_id, forced, created_at")
            .in("design_id", designIds)
            .order("created_at", { ascending: false })
            .limit(cap),
        ),
      [] as ExportSourceRow[],
    ),
    perDesign(
      () =>
        rows<ShareSourceRow>("design_shares", problems, () =>
          sb
            .from("design_shares")
            .select("id, design_id, token, revoked_at, views, created_at")
            .in("design_id", designIds)
            .order("created_at", { ascending: false })
            .limit(cap),
        ),
      [] as ShareSourceRow[],
    ),
    headCount("designs", problems, () =>
      sb.from("designs").select("id", { count: "exact", head: true }).eq("profile_id", id),
    ),
    perDesign(
      () =>
        headCount("design_versions", problems, () =>
          sb
            .from("design_versions")
            .select("id", { count: "exact", head: true })
            .in("design_id", designIds),
        ),
      0,
    ),
    perDesign(
      () =>
        headCount("design_versions", problems, () =>
          sb
            .from("design_versions")
            .select("id", { count: "exact", head: true })
            .in("design_id", designIds)
            .eq("source", "edit"),
        ),
      0,
    ),
    perDesign(
      () =>
        headCount("generation_runs", problems, () =>
          sb
            .from("generation_runs")
            .select("id", { count: "exact", head: true })
            .in("design_id", designIds)
            .neq("status", "approved"),
        ),
      0,
    ),
  ]);

  // איחוד ההזמנות משני החוטים. אותה הזמנה יכולה להגיע פעמיים (גם `profile_id`
  // וגם המייל), והמזהה הוא מה שמכריע.
  const orderById = new Map<string, OrderSourceRow>();
  for (const o of [...ownedOrders, ...emailOrders]) orderById.set(o.id, o);
  const orders = [...orderById.values()];

  const events: ActivityEvent[] = [
    ...designRows.map(
      (d): ActivityEvent => ({
        id: `design_created:${d.id}`,
        kind: "design_created",
        at: d.created_at,
        design: designById.get(d.id) ?? null,
      }),
    ),
    ...versions.map(
      (v): ActivityEvent => ({
        id: `version:${v.id}`,
        kind: "version",
        at: v.created_at,
        design: designById.get(v.design_id) ?? null,
        version: { no: v.version_no, source: v.source, status: v.validation_status },
      }),
    ),
    ...failedRuns.map(
      (r): ActivityEvent => ({
        id: `run_failed:${r.id}`,
        kind: "run_failed",
        at: r.created_at,
        design: designById.get(r.design_id) ?? null,
        run: { status: r.status, error: r.error, prompt: r.prompt },
      }),
    ),
    ...orders.map(
      (o): ActivityEvent => ({
        id: `order:${o.id}`,
        kind: "order",
        at: o.created_at,
        design: o.design_id ? (designById.get(o.design_id) ?? null) : null,
        order: {
          id: o.id,
          ref: o.ref,
          status: o.status,
          total: typeof o.price?.total === "number" ? o.price.total : null,
        },
      }),
    ),
    ...inquiries.map(
      (q): ActivityEvent => ({
        id: `inquiry:${q.id}`,
        kind: "inquiry",
        at: q.created_at,
        design: null,
        inquiry: { id: q.id, kind: q.kind, status: q.status, message: q.message },
      }),
    ),
    ...exports.map(
      (x): ActivityEvent => ({
        id: `export:${x.id}`,
        kind: "export",
        at: x.created_at,
        design: designById.get(x.design_id) ?? null,
        exported: { forced: x.forced },
      }),
    ),
    ...shares.map(
      (sh): ActivityEvent => ({
        id: `share:${sh.id}`,
        kind: "share",
        at: sh.created_at,
        design: designById.get(sh.design_id) ?? null,
        share: { token: sh.token, revoked: sh.revoked_at !== null, views: sh.views },
      }),
    ),
  ].sort(byNewestFirst);

  return {
    user: { ...user, designs: designCount, orders: orders.length },
    counts: {
      designs: designCount,
      versions: versionCount,
      edits: editCount,
      failedRuns: failedRunCount,
      orders: orders.length,
      inquiries: inquiries.length,
      exports: exports.length,
      shares: shares.length,
    },
    events: events.slice(0, cap),
    truncated: events.length > cap,
    designsTruncated: designCount > designIds.length,
    problems: [...new Set(problems)],
  };
}

/** החדש קודם, ומזהה כשובר שוויון כדי שהסדר יהיה יציב בין טעינות. */
export function byNewestFirst(a: ActivityEvent, b: ActivityEvent): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
