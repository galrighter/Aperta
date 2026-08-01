import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminCookie";

// גלישה ישירה ל-`/api/debug/log` הוחזרה כ"אתר מסוכן" ב-Chrome. דוח השקיפות של
// Safe Browsing נשאר ירוק ברמת האתר וכל שאר העמודים נטענו — כלומר הפסק היה על
// ה-URL הבודד ולא על הדומיין.
//
// אין כאן פרצה: השער החזיר 401 בדיוק כמו שצריך. יש כאן שטח פנים שאין לו סיבה
// להתקיים — דומיין בן עשרה ימים שמגיש דף שגיאת JSON חשוף תחת `/api/debug` הוא
// בדיוק הפרופיל שמסווג ההונאה מחפש, ואף לקוחה לא אמורה לנחות שם. שתי ההקשחות
// כאן לא יבטלו פסק שכבר ניתן (זה מול Google, לא מול הקוד) — הן מונעות את הבא.

const NO_INDEX = "noindex, nofollow, noarchive";

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
  const { pathname } = req.nextUrl;

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
  matcher: ["/api/:path*", "/admin/:path*", "/debug/:path*"],
};
