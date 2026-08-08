"use client";

// חלקי התצוגה של משתמש, במקום אחד: השם עם צבע הזיהוי, המייל, וכמה זמן עבר.
// מופיעים גם ברשימה וגם במסך הפירוט — שני מקומות שמציירים משתמש אחרת הם שני
// מקומות שמתחזקים אחרת (אותה הנמקה כמו `orderView`).
import { he } from "@/i18n/he";
import type { AdminUserRow } from "@/lib/db/users";
import { ageText } from "./orderView";

const s = he.site;

/** מספר הימים שעברו מאז חותמת זמן. */
export function daysSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / 86_400_000);
}

/**
 * "היום" / "לפני יום" / "לפני 12 ימים".
 *
 * `ageText` נותן את הצורה העברית התקינה למספר עצמו; כאן רק מוסיפים "לפני",
 * ולא ל"היום" — "לפני היום" אינו עברית.
 */
export function agoText(iso: string, now = Date.now()): string {
  const days = daysSince(iso, now);
  const text = ageText(days);
  return days < 1 ? text : `${s.adminUserAgo} ${text}`;
}

/** תאריך קצר בעברית. חותמת ריקה (`1970`) מוצגת כמקף ולא כ"1 בינואר 1970". */
export function shortDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t) || t <= 0) return "—";
  return new Date(t).toLocaleDateString("he-IL");
}

/** תאריך ושעה — ליומן הפעילות, שבו כמה אירועים נופלים על אותו יום. */
export function dateTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t) || t <= 0) return "—";
  return new Date(t).toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type UserIdentity = Pick<AdminUserRow, "name" | "color" | "kind">;

/** הנקודה הצבעונית והשם. הצבע נגזר מהמייל ולכן יציב — הוא הזיהוי המהיר. */
export function UserName({ user, className = "" }: { user: UserIdentity; className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: user.color }}
      />
      <span className="font-semibold text-graphite">{user.name || s.adminUserNoName}</span>
      {user.kind === "tester" && (
        <span className="bg-stonesoft px-1.5 py-0.5 text-[11px] font-normal text-ink60">
          {s.adminTesterBadge}
        </span>
      )}
    </span>
  );
}

/** המייל כקישור. בלי מייל — נאמר במפורש, ולא שורה ריקה שנראית כמו תקלה. */
export function UserEmail({ email }: { email: string | null }) {
  if (!email) return <span className="text-[13px] text-mist">{s.adminUserNoEmail}</span>;
  return (
    <a href={`mailto:${email}`} className="text-[13px] text-ink60 hover:underline">
      <bdi>{email}</bdi>
    </a>
  );
}
