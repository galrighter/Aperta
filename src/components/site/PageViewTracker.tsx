"use client";

// ‏page_view — האירוע היחיד שאי אפשר לירות מתוך מסך מסוים, כי הוא שייך לכל
// עמוד. יושב ב-layout, ולכן הוא רואה גם ניווט פנימי של Next (שאינו טעינת
// עמוד מלאה, ולכן שום ספק חיצוני שמאזין ל-load לא היה סופר אותו).
//
// בלי UI, בלי state, בלי השפעה על רנדר — רק תופעת לוואי.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/client/track";

export default function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    track("page_view");
    // ‏/d/<token> הוא ערוץ כניסה בפני עצמו — עיצוב ששותף בוואטסאפ. הספירה
    // ב-`shares.views` אומרת כמה נצפה **שיתוף מסוים**; זה אומר כמה תנועה
    // מגיעה מהערוץ, ומאיפה. הטוקן עצמו אינו נשמר (ראו `normalizePath`).
    if (pathname.startsWith("/d/")) track("share_view");
  }, [pathname]);
  return null;
}
