"use client";

import type { Product } from "@/components/create/model";

// story mode — מה שנמסר מ-`/story/create` ל-`/design?story=1`.
//
// **למה handoff ולא query string.** הסיפור הוא טקסט חופשי של הלקוחה, ולפעמים
// פסקה. כתובת נשמרת בהיסטוריה, נשלחת ב-Referer, נכנסת ליומני שרת ולאנליטיקס
// ומוגבלת באורך — שלושה נימוקים שכל אחד מהם לבדו מספיק. מה שנוסע בכתובת הוא
// `story=1` בלבד: דגל, לא תוכן.
//
// `sessionStorage` ולא `localStorage`, כמו `pendingCreate`: זו מסירה בין שני
// עמודים באותה לשונית ובאותו רגע, ולא טיוטה שאמורה לחזור מחר. מרגע שהמסע
// הרים אותה היא נמחקת — רענון של `/design?story=1` אחרי שהיצירה כבר רצה לא
// אמור להתחיל אותה מחדש.

const KEY = "aperta.story.handoff";

export interface StoryHandoff {
  product: Product;
  story: string;
}

/*
 * **המידה אינה נוסעת כאן.** היא נשאלת בדרך להזמנה, אחרי שיש תרגום שנבחר —
 * ראה STORY_RAIL ו-`applyStorySize`. עד אז המסע עובד עם ברירת המחדל של
 * המערכת, והעיצוב ממוסגר מחדש לאורך שנמדד ברגע שהיא נבחרת.
 */

/** תקינות מינימלית — מה שנקרא מהדיסק אינו בהכרח מה שנכתב אליו. */
function clean(raw: unknown): StoryHandoff | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const product = src.product === "ring" || src.product === "bracelet" ? src.product : null;
  const story = typeof src.story === "string" ? src.story.slice(0, 4000).trim() : "";
  if (!product || !story) return null;
  return { product, story };
}

export function saveStoryHandoff(value: StoryHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // מכסת אחסון או גלישה פרטית. המסע ינחת על מסך בחירת המוצר הרגיל — פחות
    // טוב, אבל לא שבור.
  }
}

/** קריאה **ומחיקה**: מסירה מתבצעת פעם אחת. */
export function popStoryHandoff(): StoryHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return clean(JSON.parse(raw));
  } catch {
    return null;
  }
}
