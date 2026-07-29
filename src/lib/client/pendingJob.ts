"use client";

/**
 * היצירה שרצה עכשיו, כפי שהדפדפן זוכר אותה.
 *
 * למה זה קיים: היצירה נמשכת דקה ויותר, והתשובה חוזרת ל-`state` בזיכרון של
 * מסך אחד. מי שלחצה "שלח" ועברה לעמוד אחר (או סגרה את הלשונית) לא קיבלה שום
 * חיווי שהעיצוב מוכן — הוא נוצר בשרת, נשמר, ופשוט חיכה שם. זה נמדד במסע אמיתי.
 *
 * `localStorage` ולא `sessionStorage`: הרשומה צריכה לשרוד סגירת לשונית, אחרת
 * היא נעלמת בדיוק במצב שהיא נכתבה בשבילו.
 *
 * **פעימת לב במקום דגל "מישהו צופה".** המסך שמחכה לתשובה מסמן זמן כל כמה
 * שניות; הצופה הגלובלי (`DesignReadyWatch`) מתעורר רק כשהפעימה התיישנה. דגל
 * בוליאני היה נשאר דלוק לנצח כשהלשונית שכתבה אותו נסגרה — כלומר בדיוק במצב
 * שבו צריך להתריע.
 */

const KEY = "rmjewel.pendingJob";

/** מעבר לזה — אף אחד לא צופה ביצירה. שתי פעימות, כדי שהחלפת מסך לא תיחשב יציאה. */
export const HEARTBEAT_STALE_MS = 12_000;
/** מעבר לזה הרשומה חסרת טעם: השרת מכריז על הרצה תקועה אחרי ~6 דקות. */
export const PENDING_MAX_AGE_MS = 15 * 60_000;

export interface PendingJob {
  jobId: string;
  designId: string;
  /** מתי היצירה התחילה (ms). */
  startedAt: number;
  /** מתי המסך שמחכה לתשובה סימן לאחרונה שהוא כאן (ms). */
  heartbeat: number;
  /** האם זו היצירה הראשונה של העיצוב — עריכה של עיצוב קיים אינה "עיצוב מוכן". */
  first: boolean;
}

function read(): PendingJob | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as PendingJob;
    if (!job?.jobId || !job?.designId) return null;
    // רשומה עתיקה נזרקת בקריאה: אחרת חלון קופץ על יצירה של אתמול.
    if (Date.now() - job.startedAt > PENDING_MAX_AGE_MS) {
      clearPendingJob();
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

function write(job: PendingJob): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(job));
  } catch {
    /* מכסת אחסון או גלישה פרטית — החיווי הוא תוספת, לא תנאי ליצירה */
  }
}

export const readPendingJob = read;

export function setPendingJob(input: { jobId: string; designId: string; first: boolean }): void {
  const now = Date.now();
  write({ ...input, startedAt: now, heartbeat: now });
}

/** "אני עוד כאן ומחכה" — נקרא מהמסך שמציג את מצב היצירה. */
export function beatPendingJob(jobId: string): void {
  const job = read();
  if (!job || job.jobId !== jobId) return;
  write({ ...job, heartbeat: Date.now() });
}

export function clearPendingJob(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* אין מה לעשות אם האחסון חסום */
  }
}

/** האם אף מסך לא מחכה לתשובה של ההרצה הזו. */
export const isUnwatched = (job: PendingJob): boolean =>
  Date.now() - job.heartbeat > HEARTBEAT_STALE_MS;
