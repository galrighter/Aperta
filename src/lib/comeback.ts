import { supabaseAdmin } from "@/lib/db/supabase";
import { sendMail, mailConfigured } from "@/lib/mail";
import { comebackMail } from "@/lib/mailTemplates";
import { designSampleCode } from "@/lib/designCode";
import { SITE } from "@/lib/site.config";

// מייל "חזרנו לאוויר" — למי שנתקע ביצירה ונטש (החלטת גל, 10.8).
//
// המערכת יודעת בדיוק מי נתקע: עיצוב בלי גרסה הוא יצירה שנכשלה או נקטעה,
// והפרטים שלה שמורים — בשרת (המידות) ובדפדפן (התיאור, דרך הטיוטה המקומית).
// מה שהיה חסר למי שנתקע הוא הידיעה שהתקלה תוקנה ושיש לאן לחזור.
//
// **השליחה היא הכרזה של אדם.** "התקלה נפתרה" אינה עובדה שהמערכת יודעת —
// ולכן אין כאן שום אוטומציה: גל מריץ את זה במפורש (workflow "Comeback mail"),
// אחרי שתיקן, עם תצוגה מקדימה לפני. מה שהמערכת כן עושה לבד: מוצאת את
// המועמדים, מוודאת שאיש לא מקבל את אותו מייל פעמיים, ושולחת רק למי שבאמת
// נשאר תקוע — מי שהצליח ליצור מאז אינו "נטש", הוא חזר בעצמו.

/** דדופ: מייל אחד לעיצוב תקוע, לתמיד מעשית. יושב ב-rate_events הקיימת —
 *  "כבר שלחתי על זה" ו"כבר ניסית את זה" הם אותו מנגנון. */
const DEDUPE_WINDOW_MS = 180 * 24 * 60 * 60_000;

export interface ComebackCandidate {
  designId: string;
  /** `AP-0102` / `AP-0085.2` — הרפרנס שנכנס למייל. */
  code: string | null;
  email: string;
  name: string;
  /** מתי היצירה נתקעה — למיון ולתצוגה המקדימה. */
  stuckAt: string;
  /** כבר קיבל את המייל על העיצוב הזה — יוצג בתצוגה, ידולג בשליחה. */
  alreadySent: boolean;
}

export interface ComebackReport {
  candidates: ComebackCandidate[];
  /** כמה מיילים יצאו בפועל (בשליחה; 0 בתצוגה מקדימה). */
  sent: number;
  /** כשלי שליחה, אם היו — כדי שהריצה תדע לספר מה לא הגיע. */
  failures: string[];
}

type StuckDesignRow = {
  id: string;
  profile_id: string;
  serial: number | null;
  root_serial: number | null;
  sample_no: number | null;
  created_at: string;
};

/**
 * המועמדים: עיצובים בלי גרסה מהחלון המבוקש, שבעליהם — חשבון אמיתי עם מייל —
 * לא הצליחו ליצור שום דבר מאז. עיצוב תקוע אחד לכל בעלים: האחרון, כי הקישור
 * שנשלח הוא נקודת ההמשך והוא צריך להצביע על הניסיון הטרי ביותר.
 */
export async function findComebackCandidates(sinceIso: string): Promise<ComebackCandidate[]> {
  const sb = supabaseAdmin();

  const { data: stuck, error } = await sb
    .from("designs")
    .select("id, profile_id, serial, root_serial, sample_no, created_at")
    .is("current_version_id", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (stuck ?? []) as StuckDesignRow[];
  if (!rows.length) return [];

  // עיצוב אחד לבעלים — הטרי ביותר (הרשימה כבר ממוינת יורד).
  const byOwner = new Map<string, StuckDesignRow>();
  for (const d of rows) if (!byOwner.has(d.profile_id)) byOwner.set(d.profile_id, d);
  const ownerIds = [...byOwner.keys()];

  // רק חשבונות אמיתיים עם מייל. בודקים הם הסטודיו הפנימי — עיצוב canary תקוע
  // אינו לקוח שנטש.
  const { data: owners, error: ownersErr } = await sb
    .from("profiles")
    .select("id, name, email, kind")
    .in("id", ownerIds);
  if (ownersErr) throw new Error(ownersErr.message);

  // מי הצליח מאז שנתקע — כלומר יש לו עיצוב **עם** גרסה שעודכן אחרי התקיעה —
  // חזר בעצמו, ומייל "חזרנו" היה מגיע אליו אחרי שכבר חזר.
  const { data: succeeded, error: succErr } = await sb
    .from("designs")
    .select("profile_id, updated_at")
    .in("profile_id", ownerIds)
    .not("current_version_id", "is", null);
  if (succErr) throw new Error(succErr.message);
  const lastSuccess = new Map<string, number>();
  for (const s of (succeeded ?? []) as Array<{ profile_id: string; updated_at: string }>) {
    const t = new Date(s.updated_at).getTime();
    if (t > (lastSuccess.get(s.profile_id) ?? 0)) lastSuccess.set(s.profile_id, t);
  }

  const out: ComebackCandidate[] = [];
  for (const owner of (owners ?? []) as Array<{ id: string; name: string; email: string | null; kind: string }>) {
    if (owner.kind !== "friend" || !owner.email) continue;
    const d = byOwner.get(owner.id)!;
    if ((lastSuccess.get(owner.id) ?? 0) > new Date(d.created_at).getTime()) continue;
    out.push({
      designId: d.id,
      code: designSampleCode(d),
      email: owner.email,
      name: owner.name?.trim() || owner.email.split("@")[0],
      stuckAt: d.created_at,
      alreadySent: await alreadySent(d.id),
    });
  }
  return out;
}

/** האם המייל על העיצוב הזה כבר יצא. קריאה בלבד — התצוגה המקדימה לא רושמת. */
async function alreadySent(designId: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("rate_events")
    .select("id", { count: "exact", head: true })
    .eq("bucket", `comeback:${designId}`)
    .gte("created_at", since);
  // כשל בבדיקה נחשב "לא נשלח": עדיף סיכון של מייל כפול נדיר מאשר לא לשלוח
  // בכלל בגלל שאילתה שנפלה — אבל הוא נרשם, כדי שריצה חוזרת לא תכפיל שוב.
  if (error) {
    console.error("comeback dedupe check failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * מריץ את המהלך: מוצא, ואם `send` — שולח ומסמן. תצוגה מקדימה היא אותה ריצה
 * בדיוק בלי הצעד האחרון, כדי שמה שרואים הוא מה שיישלח.
 */
export async function runComeback(input: { sinceIso: string; send: boolean }): Promise<ComebackReport> {
  const candidates = await findComebackCandidates(input.sinceIso);
  if (!input.send) return { candidates, sent: 0, failures: [] };
  if (!mailConfigured()) return { candidates, sent: 0, failures: ["mail_not_configured"] };

  let sent = 0;
  const failures: string[] = [];
  for (const c of candidates) {
    if (c.alreadySent) continue;
    const mail = comebackMail({
      name: c.name,
      code: c.code,
      url: `${SITE.url}/design?resume=${c.designId}`,
    });
    const res = await sendMail({ to: c.email, subject: mail.subject, text: mail.text, html: mail.html });
    if (!res.ok) {
      failures.push(`${c.email}: ${res.error}`);
      continue;
    }
    sent += 1;
    const { error } = await supabaseAdmin()
      .from("rate_events")
      .insert({ bucket: `comeback:${c.designId}` });
    if (error) console.error("comeback dedupe mark failed:", error.message);
  }
  return { candidates, sent, failures };
}
