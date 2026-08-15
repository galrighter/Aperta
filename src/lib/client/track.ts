"use client";

/**
 * חמשת אירועי המשפך, מהדפדפן.
 *
 * **למה בכלל.** שכבת הנתונים התחתונה מצוינת — designs, ‏versions, ‏orders,
 * ‏runs — אבל היא מתחילה למדוד רק אחרי שהמשתמשת כבר בפנים. מה שאין עליו שום
 * נתון הוא ראש המשפך: כמה נכנסו, מאיפה, וכמה נטשו לפני העיצוב הראשון. בלי
 * זה אי אפשר לדעת אם הדלי דולף בכניסה או בצ'קאאוט
 * (docs/FULL_AUDIT_2026-08.md, פרק 6 §KPIs).
 *
 * **שלושה כללים שהמודול הזה מקיים בלי יוצא מן הכלל:**
 *
 * 1. **לעולם לא זורק ולעולם לא מעכב.** מדידה שמפילה מסך היא הרעה שבשתי
 *    הרעות. הכול עטוף, וה-`sendBeacon` לא נותן לשגיאה שלו לצאת החוצה.
 * 2. **לא נשמר דבר שמזהה אדם.** אין עוגייה, אין מזהה שמחזיק בין ביקורים,
 *    ואין URL מלא של מפנה — רק ה-host. `sessionKey` הוא מספר אקראי
 *    ב-sessionStorage שמת עם הלשונית, ותפקידו היחיד הוא לחבר "נכנסה"
 *    ל"התחילה לעצב" באותו ביקור.
 * 3. **דדופ לפי אירוע ולפי ביקור.** הרנדר של React יכול לרוץ פעמיים,
 *    והמשתמשת יכולה לחזור אחורה ולהיכנס שוב למסך — ושניהם היו מנפחים את אותו
 *    שלב פי שניים. `page_view` הוא היוצא מן הכלל: הוא נספר לכל נתיב בנפרד.
 */

import { FUNNEL_EVENTS, type FunnelEvent } from "@/lib/db/funnel";

export type { FunnelEvent };
export { FUNNEL_EVENTS };

const SESSION_KEY = "aperta.sk";

/** מזהה הביקור. אקראי, פר-לשונית, ומת איתה. */
function sessionKey(): string | null {
  try {
    const cur = sessionStorage.getItem(SESSION_KEY);
    if (cur) return cur;
    const next = Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    // דפדפן שחוסם אחסון. האירוע עדיין נשלח — בלי חיבור בין השלבים.
    return null;
  }
}

/** מה שכבר נשלח בביקור הזה. בזיכרון בלבד: רענון מתחיל ביקור חדש ממילא. */
const sent = new Set<string>();

/**
 * הנתיב, בלי מה שאסור לשמור.
 *
 * ‏`/d/<token>` הוא **סוד** — הטוקן הוא מה שמעניק גישה לעיצוב המשותף, ושמירתו
 * בטבלת אירועים הופכת כל מי שקורא אנליטיקס למי שיכול לפתוח כל שיתוף. הנתיב
 * מנורמל ל-`/d/:token`, כלומר נספר בלי להישמר.
 */
export function normalizePath(path: string): string {
  return path.replace(/^\/d\/[^/]+/, "/d/:token");
}

function deviceOf(): "mobile" | "desktop" {
  // אותה שאלה שה-CSS שואל, ולא ניתוח user-agent: מה שמעניין הוא הרוחב
  // שהמסך נבנה לפיו, לא איזה מכשיר זה.
  return typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop";
}

/**
 * שולח אירוע. חוזר מיד — `sendBeacon` מעביר את השליחה לדפדפן, כך שהיא שורדת
 * גם ניווט שקורה מיד אחריה (וזה בדיוק המקרה של `order_placed`).
 */
export function track(event: FunnelEvent, opts: { designId?: string | null } = {}): void {
  if (typeof window === "undefined") return;
  try {
    const path = normalizePath(window.location.pathname);
    // ‏page_view לכל נתיב בנפרד; כל השאר — פעם אחת לביקור.
    const dedupe = event === "page_view" ? `${event}:${path}` : event;
    if (sent.has(dedupe)) return;
    sent.add(dedupe);

    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      event,
      path,
      // ‏referrer של אותו אתר אינו מקור — הוא ניווט פנימי.
      referrer: sameOrigin(document.referrer) ? undefined : document.referrer || undefined,
      utmSource: params.get("utm_source")?.slice(0, 80) || undefined,
      device: deviceOf(),
      sessionKey: sessionKey() ?? undefined,
      designId: opts.designId ?? undefined,
    });

    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/events", blob)) {
      // דפדפן בלי sendBeacon, או תור מלא. ‏keepalive עושה את אותו דבר.
      void fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // בשתיקה מוחלטת. ראו כלל 1.
  }
}

function sameOrigin(ref: string): boolean {
  if (!ref) return false;
  try {
    return new URL(ref).host === window.location.host;
  } catch {
    return false;
  }
}
