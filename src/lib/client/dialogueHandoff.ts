"use client";

import type { Product } from "@/components/create/model";

// dialogue mode — מה שנמסר מ-`/dialogue/create` ל-`/design?dialogue=1`.
//
// אותה תבנית בדיוק כמו `storyHandoff`, מאותם נימוקים: תוצר הראיון הוא JSON
// של כמה קילובייט וסיכום עברי — לא דבר שנוסע בכתובת; בכתובת נוסע `dialogue=1`
// בלבד, דגל ולא תוכן. `sessionStorage` כי זו מסירה בין שני עמודים באותה
// לשונית וברגע אחד; מרגע שהמסע הרים אותה היא נמחקת — רענון של
// `/design?dialogue=1` אחרי שהיצירה רצה לא מתחיל אותה מחדש.

const KEY = "aperta.dialogue.handoff";

export interface DialogueHandoff {
  product: Product;
  /** הכיוונים כפי שהראיון החזיר — עם `sources`. השרת מאמת אותם מחדש. */
  directions: string;
  /** הסיכום שאושר, בעברית. הוא ה-brief של היצירה — מה שנרשם ביומן ומה
   *  שהנפילה-לאחור רצה עליו. */
  summary: string;
  /** התמליל, לשורת היומן (‏PROMPT_SPEC §5 — הקורפוס). */
  transcript?: string;
  /** ‏`utm_content` — הקריאייטיב שהביא אותה (§3.4). */
  utm?: string;
  /** מצב הידיעה שהראיון זיהה (§3.5). */
  expectation?: string;
}

/** תקינות מינימלית — מה שנקרא מהדיסק אינו בהכרח מה שנכתב אליו. */
function clean(raw: unknown): DialogueHandoff | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const product = src.product === "ring" || src.product === "bracelet" ? src.product : null;
  const directions = typeof src.directions === "string" ? src.directions.slice(0, 64_000).trim() : "";
  const summary = typeof src.summary === "string" ? src.summary.slice(0, 4000).trim() : "";
  if (!product || !directions || !summary) return null;
  const opt = (key: "transcript" | "utm" | "expectation", max: number): string | undefined => {
    const v = src[key];
    return typeof v === "string" && v.trim() ? v.slice(0, max) : undefined;
  };
  return {
    product,
    directions,
    summary,
    transcript: opt("transcript", 20_000),
    utm: opt("utm", 200),
    expectation: opt("expectation", 40),
  };
}

export function saveDialogueHandoff(value: DialogueHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // מכסת אחסון או גלישה פרטית. המסע ינחת על מסך בחירת המוצר הרגיל — פחות
    // טוב, אבל לא שבור.
  }
}

/** קריאה **ומחיקה**: מסירה מתבצעת פעם אחת. */
export function popDialogueHandoff(): DialogueHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return clean(JSON.parse(raw));
  } catch {
    return null;
  }
}
