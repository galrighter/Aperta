import { supabaseAdmin } from "./supabase";
import { ApiError } from "@/lib/api";

// שכבת הגישה ל-`funnel_events` (migration 0023). service role בלבד.
//
// חמישה אירועים סגורים, ולא מערכת אירועים כללית: מה שנשאל בפועל הוא "כמה
// נכנסו, כמה התחילו לעצב, כמה ראו גרסה, כמה הגיעו לצ'קאאוט, כמה הזמינו" —
// וחמש השאלות האלה נכתבות מראש. אירוע חופשי היה טבלה שמתמלאת בשמות שאיש לא
// זוכר ושאילתה שאי אפשר לכתוב לפני שרואים מה נכנס.

export const FUNNEL_EVENTS = [
  "page_view",
  "design_start",
  "first_version",
  "checkout_view",
  "order_placed",
  "share_view",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** חמשת שלבי המשפך לפי הסדר. `share_view` אינו שלב — הוא ערוץ כניסה. */
export const FUNNEL_STEPS: FunnelEvent[] = [
  "page_view",
  "design_start",
  "first_version",
  "checkout_view",
  "order_placed",
];

export interface NewFunnelEvent {
  event: FunnelEvent;
  path?: string | null;
  referrerHost?: string | null;
  utmSource?: string | null;
  device?: "mobile" | "desktop" | null;
  sessionKey?: string | null;
  designId?: string | null;
}

/** מסד שעוד לא קיבל את 0023 — כמו בשאר השכבות, מיגרציה חסרה אינה 500. */
function fail(error: { message: string }): never {
  if (/does not exist|schema cache|relation .* does not exist/i.test(error.message)) {
    throw new ApiError("schema_outdated", "Database is missing migration 0023_funnel_events", 503);
  }
  throw new Error(error.message);
}

export async function recordFunnelEvent(input: NewFunnelEvent): Promise<void> {
  const { error } = await supabaseAdmin().from("funnel_events").insert({
    event: input.event,
    path: input.path ?? null,
    referrer_host: input.referrerHost ?? null,
    utm_source: input.utmSource ?? null,
    device: input.device ?? null,
    session_key: input.sessionKey ?? null,
    design_id: input.designId ?? null,
  });
  if (error) fail(error);
}

export interface FunnelSummary {
  /** ימים אחורה שנספרו. */
  days: number;
  /** ספירה לכל אירוע — כולל אפסים, כדי ששלב ריק ייראה ולא ייעלם. */
  counts: Record<FunnelEvent, number>;
  /** כמה ביקורים ייחודיים (לפי `session_key`) הגיעו לכל שלב. */
  sessions: Record<FunnelEvent, number>;
  /** מאיפה הגיעו — הוסטים המפנים הנפוצים. */
  sources: Array<{ source: string; count: number }>;
  /** מובייל מול דסקטופ, על `page_view`. */
  devices: { mobile: number; desktop: number };
}

const emptyCounts = (): Record<FunnelEvent, number> =>
  Object.fromEntries(FUNNEL_EVENTS.map((e) => [e, 0])) as Record<FunnelEvent, number>;

/**
 * הסיכום שהבק־אופיס מציג.
 *
 * שליפה אחת ולא שש: הנפח כאן קטן (אלפי שורות לשבוע בקצב ריאלי), והספירה
 * בזיכרון פשוטה מספיק כדי שלא יהיה שווה להחזיק שש שאילתות מקבילות שכל אחת
 * יכולה להיכשל בנפרד. התקרה קיימת כדי שיום חריג לא יפיל את המסך — והיא
 * נאמרת בתשובה (`truncated`) ולא נבלעת.
 */
export async function funnelSummary(days = 7): Promise<FunnelSummary & { truncated: boolean }> {
  const LIMIT = 20_000;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("funnel_events")
    .select("event, referrer_host, utm_source, device, session_key")
    .gte("created_at", since)
    .limit(LIMIT);
  if (error) fail(error);

  const rows = (data ?? []) as Array<{
    event: FunnelEvent;
    referrer_host: string | null;
    utm_source: string | null;
    device: "mobile" | "desktop" | null;
    session_key: string | null;
  }>;

  const counts = emptyCounts();
  const seen: Record<FunnelEvent, Set<string>> = Object.fromEntries(
    FUNNEL_EVENTS.map((e) => [e, new Set<string>()]),
  ) as Record<FunnelEvent, Set<string>>;
  const sources = new Map<string, number>();
  const devices = { mobile: 0, desktop: 0 };

  for (const r of rows) {
    if (!FUNNEL_EVENTS.includes(r.event)) continue;
    counts[r.event]++;
    if (r.session_key) seen[r.event].add(r.session_key);
    if (r.event === "page_view") {
      if (r.device === "mobile" || r.device === "desktop") devices[r.device]++;
      // ‏utm גובר על המפנה: קמפיין מסומן הוא מה שרצינו לדעת, גם כשהדפדפן
      // מוסר גם וגם. "ישיר" ולא ריק — שורה בלי שם אינה תשובה.
      const key = r.utm_source || r.referrer_host || "ישיר";
      sources.set(key, (sources.get(key) ?? 0) + 1);
    }
  }

  return {
    days,
    counts,
    sessions: Object.fromEntries(
      FUNNEL_EVENTS.map((e) => [e, seen[e].size]),
    ) as Record<FunnelEvent, number>,
    sources: [...sources.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    devices,
    truncated: rows.length >= LIMIT,
  };
}

/**
 * ניקוי. אירועי משפך נשאלים בטווח של שבועות, ושורה בת חצי שנה היא נפח בלבד —
 * ובטבלה שמקבלת כתיבה מכל ביקור, נפח הופך לחשבון.
 */
export async function sweepFunnelEvents(olderThanDays = 180): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("funnel_events")
    .delete()
    .lt("created_at", cutoff)
    .select("id");
  if (error) fail(error);
  return (data ?? []).length;
}
