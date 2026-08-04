import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminCookie";
import { SITE } from "@/lib/site.config";

// גלישה ישירה ל-`/api/debug/log` הוחזרה כ"אתר מסוכן" ב-Chrome. דוח השקיפות של
// Safe Browsing נשאר ירוק ברמת האתר וכל שאר העמודים נטענו — כלומר הפסק היה על
// ה-URL הבודד ולא על הדומיין.
//
// אין כאן פרצה: השער החזיר 401 בדיוק כמו שצריך. יש כאן שטח פנים שאין לו סיבה
// להתקיים — דומיין בן עשרה ימים שמגיש דף שגיאת JSON חשוף תחת `/api/debug` הוא
// בדיוק הפרופיל שמסווג ההונאה מחפש, ואף לקוחה לא אמורה לנחות שם. שתי ההקשחות
// כאן לא יבטלו פסק שכבר ניתן (זה מול Google, לא מול הקוד) — הן מונעות את הבא.

const NO_INDEX = "noindex, nofollow, noarchive";
/** העצים שאין להם מה לחפש במנוע חיפוש. שאר האתר עובר כאן ואינו מסומן. */
const NO_INDEX_TREES = ["/api", "/admin", "/debug"];

const CANONICAL_HOST = new URL(SITE.url).host;

/**
 * origin אחד לכל האתר.
 *
 * `www.aperta-designs.com` ו-`aperta-designs.com` הם שני custom domains של אותו
 * Worker (wrangler.jsonc), ולכן שניהם הגישו את האתר במלואו — ולדפדפן הם שני
 * origins **נפרדים**. כל מה שהלקוחה צוברת שייך לאחד מהם בלבד: עוגיות הסשן,
 * הטיוטה ב-`sessionStorage` שנושאת את המשפך לרוחב מסע ה-OAuth, ורשימת
 * "העיצובים שלי" ב-`localStorage`. מעבר בין השניים נראה כמו התנתקות שרירותית.
 *
 * מה שחשף את זה (4.8, 08:46): כניסה עם גוגל מ-`www` זרקה לדף הבית. `redirectTo`
 * נבנה מ-`window.location.origin`, כלומר `https://www...`, ו-GoTrue מחליף כתובת
 * חזרה שאינה ב-`uri_allow_list` ב-`site_url`. הקוד הונפק ומעולם לא נפדה —
 * `auth.flow_state` הראה `auth_code_issued_at` בלי session תואם. הרשימה עודכנה
 * מיד, אבל להוסיף כתובת לרשימה זה לרפא סימפטום: כל origin נוסף הוא עוד עותק של
 * מצב הלקוחה. כאן נסגר המקור.
 *
 * מוגבל ל-`www.` המפורש: `localhost` בפיתוח ו-`*.workers.dev` בבדיקות פריסה
 * צריכים להמשיך לענות בעצמם.
 */
function canonicalHost(req: NextRequest): URL | null {
  const host = req.headers.get("host")?.toLowerCase();
  if (host !== `www.${CANONICAL_HOST}`) return null;
  return new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, SITE.url);
}

/**
 * ניווט של דפדפן (סרגל הכתובות, לינק, פתיחה בטאב חדש) להבדיל מקריאת רקע.
 * כל פנייה ל-`/api` באתר היא `fetch`, ששולח `cors` או `same-origin`, ולכן
 * ההפניה למטה אינה נוגעת באפליקציה עצמה. לקוח שאינו דפדפן (curl, ה-vectorizer)
 * אינו שולח את הכותרת כלל ולכן גם הוא עובר.
 */
function isDocumentNavigation(req: NextRequest): boolean {
  return req.headers.get("sec-fetch-mode") === "navigate";
}

export function middleware(req: NextRequest) {
  // ראשון, ולפני כל בדיקה שתלויה בנתיב: זו השאלה מי בכלל אמור לענות. 308 ולא
  // 303 — הוא קבוע, ושומר על השיטה והגוף, כך שגם POST שהגיע ל-`www` שורד.
  const canonical = canonicalHost(req);
  if (canonical) return NextResponse.redirect(canonical, 308);

  const { pathname } = req.nextUrl;

  // ה-matcher פרוס על כל האתר בשביל הקנוניקל, ומכאן והלאה מדובר רק בעצים
  // הסגורים. בלי הסינון הזה כל עמוד ציבורי היה יוצא עם `noindex`.
  const guarded = NO_INDEX_TREES.some((t) => pathname === t || pathname.startsWith(`${t}/`));
  if (!guarded) return NextResponse.next();

  // נוכחות בלבד, לא אימות: **זו אינה בדיקת הרשאה** — האימות היושב ב-
  // `requireAdmin` הוא היחיד שסופר, והוא נשאר במקומו על כל מסלול. כאן רק
  // נשמרת היכולת של מי שכבר בבק־אופיס לפתוח מסלול API ישירות ככלי עבודה,
  // במקום להיזרק לדף הבית.
  const looksAdmin = req.cookies.has(ADMIN_COOKIE);

  if (pathname.startsWith("/api") && !looksAdmin && isDocumentNavigation(req)) {
    return NextResponse.redirect(new URL("/", req.url), 303);
  }

  const res = NextResponse.next();
  // `robots.txt` הוא בקשה מנומסת שתקפה רק לזחלן שטרח לקרוא אותה, ורק לפני
  // הזחילה. הכותרת נוסעת עם כל תגובה — גם כשהגיעו למסלול מלינק חיצוני.
  res.headers.set("X-Robots-Tag", NO_INDEX);
  return res;
}

export const config = {
  // כל האתר, כי הקנוניקל חייב לתפוס גם עמוד ציבורי — משם מתחיל המשפך. הנכסים
  // הבנויים מוחרגים: הם נענים מהאחסון בלי לעורר את ה-Worker, ואין להם מה להרוויח
  // מהמעבר כאן.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
