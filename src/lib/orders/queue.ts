import type { OrderRow, OrderStatus } from "@/lib/db/orders";

// תור העבודה: "מה מחכה לי היום", ולא "מה הוזמן לפי סדר כרונולוגי".
//
// רשימה לפי תאריך עונה על שאלה שלא נשאלת. השאלה שנשאלת בפועל בבוקר היא מה
// תקוע: מה חדש וממתין לתשובה, מה אושר ולא נחתך, מה בייצור יותר מדי זמן. לכן
// הקיבוץ הוא לפי סטטוס בסדר הדחיפות, והגיל נמדד **מהמעבר לסטטוס הנוכחי** ולא
// מיצירת ההזמנה: הזמנה בת חודש שנשלחה אתמול אינה מאחרת, והזמנה בת שבוע שאושרה
// לפני שבוע — כן.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * מעל כמה ימים בסטטוס אחד ההזמנה מסומנת כתקועה. אלה מספרים של סדר גודל, לא
 * התחייבות ללקוחה: תפקידם להוציא שורה מהרקע, ולא למדוד זמן אספקה.
 *
 * `cancelled` אינו כאן — הזמנה שבוטלה לא מתיישנת.
 */
export const STUCK_AFTER_DAYS: Record<Exclude<OrderStatus, "cancelled">, number> = {
  sent: 2,
  approved: 3,
  in_production: 7,
  shipped: 14,
};

/** סדר הדחיפות בתור. לקוחה שממתינה לתשובה קודמת להזמנה שכבר בדרך אליה. */
export const QUEUE_ORDER: Array<Exclude<OrderStatus, "cancelled">> = [
  "sent",
  "approved",
  "in_production",
  "shipped",
];

/**
 * מתי ההזמנה נכנסה לסטטוס הנוכחי שלה.
 *
 * מההיסטוריה ולא מ-`updated_at`: כל עדכון הערה נוגע ב-`updated_at`, ואז הזמנה
 * תקועה נראית טרייה בדיוק בגלל שמישהו כתב עליה הערה. נופלים ל-`updated_at`
 * ואז ל-`created_at` רק כשההיסטוריה חסרה (שורות מלפני 0011 והלאה).
 */
export function statusSince(o: OrderRow): string {
  const history = o.status_history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === o.status) return history[i].at;
  }
  return o.updated_at ?? o.created_at;
}

/** כמה ימים ההזמנה יושבת בסטטוס הנוכחי. שבר, לא מעוגל — העיגול הוא של התצוגה. */
export function daysInStatus(o: OrderRow, now = Date.now()): number {
  const at = new Date(statusSince(o)).getTime();
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, (now - at) / DAY_MS);
}

/** תקועה: יותר מדי זמן באותו סטטוס. הזמנה שבוטלה או נשלחה־ונסגרה אינה תקועה. */
export function isStuck(o: OrderRow, now = Date.now()): boolean {
  if (o.status === "cancelled") return false;
  return daysInStatus(o, now) > STUCK_AFTER_DAYS[o.status];
}

/**
 * הזמנה שהתקדמה בלי שהתשלום סומן (0022).
 *
 * `sent` אינה כזאת — הזמנה שהתקבלה ועוד לא אושרה אמורה להיות בלי תשלום.
 * הרגע שבו זה הופך לשאלה הוא האישור: משם והלאה נחתך פליז. `cancelled` יוצאת
 * מהצינור ואינה מעניינת.
 */
export function isUnpaid(o: OrderRow): boolean {
  if (o.paid_at) return false;
  return o.status === "approved" || o.status === "in_production" || o.status === "shipped";
}

export interface QueueBucket {
  status: Exclude<OrderStatus, "cancelled">;
  orders: OrderRow[];
  /** כמה מהן תקועות — המספר שקובע אם צריך להסתכל על הקבוצה הזאת עכשיו. */
  stuck: number;
  /** כמה מהן התקדמו בלי סימון תשלום. */
  unpaid: number;
}

/**
 * התור: קבוצה לכל סטטוס פעיל, בסדר הדחיפות, והתקועות בראש כל קבוצה.
 *
 * קבוצה ריקה נשמטת — "0 בייצור" הוא שורה שתופסת מקום ולא אומרת כלום. הזמנות
 * שבוטלו אינן בתור בכלל; הן קיימות בתצוגת "כל ההזמנות".
 */
export function buildQueue(orders: OrderRow[], now = Date.now()): QueueBucket[] {
  const buckets: QueueBucket[] = [];
  for (const status of QUEUE_ORDER) {
    const mine = orders.filter((o) => o.status === status);
    if (mine.length === 0) continue;
    // תקוע קודם, ובתוך כל קבוצה הוותיק קודם: מי שממתין הכי הרבה זמן הוא מי
    // שהרשימה נועדה להזכיר.
    const sorted = [...mine].sort((a, b) => daysInStatus(b, now) - daysInStatus(a, now));
    buckets.push({
      status,
      orders: sorted,
      stuck: sorted.filter((o) => isStuck(o, now)).length,
      unpaid: sorted.filter(isUnpaid).length,
    });
  }
  return buckets;
}
