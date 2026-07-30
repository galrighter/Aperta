"use client";

// חיווי המשתמש בכותרת האתר: מי מחובר, מעבר לעיצובים שלו, ויציאה.
//
// עד עכשיו הזהות הייתה גלויה רק בתוך משפך `/design`, בשורה קטנה מעל בחירת
// המוצר — כך שמי שנכנס לאתר לא ידע אם הוא מחובר, לא היה לו לאן ללחוץ כדי
// להגיע לעיצובים שלו, ולא הייתה בכלל דרך לצאת.
import { useCallback, useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { api } from "@/lib/client/api";
import { clearMyDesigns } from "@/lib/client/myDesigns";
import { clearCreateState } from "@/lib/client/pendingCreate";
import { authConfigured, supabaseBrowser } from "@/lib/client/supabaseBrowser";
import type { Account } from "@/lib/client/types";

const s = he.site;

/** הקישור לעיצובים שלי — פותח את המשפך עם רשימת העיצובים פרושה. */
export const MY_DESIGNS_HREF = "/design?designs=1";

/** הקישור לכניסה — פותח את המשפך עם שער הזיהוי פרוש. */
export const SIGN_IN_HREF = "/design?signin=1";

/** השם להצגה: השם הפרטי, ואם אין שם — החלק שלפני ה-@ במייל. */
function shortName(a: Account): string {
  const raw = a.name?.trim() || a.email.split("@")[0] || "";
  return raw.split(/\s+/)[0].slice(0, 18);
}

async function signOutEverywhere() {
  // גם בדפדפן וגם בשרת: ה-SDK מחזיק סשן משלו, ובלי היציאה שלו הכניסה הבאה
  // חוזרת לאותו משתמש בלי לשאול.
  try {
    if (authConfigured) await supabaseBrowser().auth.signOut();
  } catch {
    /* ממשיכים לניקוי בשרת בכל מקרה */
  }
  try {
    await api.signOut();
  } catch {
    /* גם אם הניקוי בשרת נכשל, ממשיכים לנקות מקומית */
  }
  // האינדקס המקומי הוא של מי שמחובר במכשיר הזה. העיצובים עצמם נשארים בשרת
  // וחוזרים בכניסה עם אותו מייל.
  clearCreateState();
  clearMyDesigns();
}

/**
 * מוצג בשורת הניווט של הדסקטופ. `variant="menu"` הוא אותה פונקציונליות
 * בתפריט המובייל, שם אין מקום לתפריט נפתח בתוך תפריט.
 */
export default function AccountMenu({
  variant = "chip",
  onNavigate,
}: {
  variant?: "chip" | "menu";
  onNavigate?: () => void;
}) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .account()
      .then(({ account: a }) => setAccount(a))
      // כשל בבדיקה אינו "לא מחובר" מבחינת השרת, אבל מבחינת הכותרת אין מה
      // להציג — ולכן אותו מצב בדיוק, בלי הודעת שגיאה על דבר שאיש לא ביקש.
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = useCallback(async () => {
    setBusy(true);
    await signOutEverywhere();
    // טעינה מלאה ולא ניווט פנימי: מסכים אחרים מחזיקים את החשבון ב-state שלהם,
    // ורענון הוא הדרך היחידה שבה כולם רואים את אותו דבר.
    window.location.assign("/");
  }, []);

  // בטעינה לא מציגים כלום — חיווי שמהבהב בין "כניסה" ל"מחוברת" גרוע משתיהן.
  if (account === undefined) return null;

  if (!account) {
    // מי שלא מחובר: הכניסה קורית בתוך המשפך, ולכן הקישור מבקש ממנו במפורש
    // לפתוח את השער (`?signin=1`) ולא רק מנווט אליו.
    //
    // `a` ולא `Link`, מאותה סיבה בדיוק כמו "העיצובים שלי" למטה: הקישור נושא
    // מצב פתיחה בכתובת, וניווט פנימי אינו מרנדר את העמוד מחדש — כלומר מי
    // שכבר עומד על /design היה לוחץ "כניסה" ולא היה קורה כלום.
    return (
      <a
        href={SIGN_IN_HREF}
        onClick={onNavigate}
        className="text-sm text-ink60 transition-colors hover:text-cobalt"
      >
        {s.headerSignIn}
      </a>
    );
  }

  const name = shortName(account);

  if (variant === "menu") {
    return (
      <div className="flex w-full flex-col gap-3 border-t border-graphite/10 pt-3 text-base">
        <span className="flex items-center gap-2 text-sm text-ink60">
          <Avatar name={name} />
          <bdi className="font-semibold text-graphite">{name}</bdi>
        </span>
        {/* `a` ולא `Link`: הקישור נושא מצב פתיחה בכתובת, וניווט פנימי מ-/design
            אל /design?designs=1 לא מרנדר את העמוד מחדש — כלומר לא היה קורה כלום. */}
        <a href={MY_DESIGNS_HREF} onClick={onNavigate} className="text-graphite hover:text-cobalt">
          {s.headerMyDesigns}
        </a>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={busy}
          className="self-start text-start text-ink60 hover:text-graphite disabled:opacity-50"
        >
          {s.headerSignOut}
        </button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={s.headerAccountMenu}
        className="flex items-center gap-2 rounded-[2px] border border-graphite/15 py-1 pe-2.5 ps-1 text-sm text-graphite transition-colors hover:border-cobalt"
      >
        <Avatar name={name} />
        <bdi className="max-w-[9ch] truncate">{name}</bdi>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+6px)] z-30 min-w-[190px] border border-graphite/15 bg-white py-1 shadow-lg"
        >
          <div className="px-3 py-2 text-[12px] text-mist">
            <bdi>{account.email || name}</bdi>
          </div>
          <a
            href={MY_DESIGNS_HREF}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="block px-3 py-2 text-sm text-graphite hover:bg-porcelain"
          >
            {s.headerMyDesigns}
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            disabled={busy}
            className="block w-full px-3 py-2 text-start text-sm text-ink60 hover:bg-porcelain disabled:opacity-50"
          >
            {s.headerSignOut}
          </button>
        </div>
      )}
    </div>
  );
}

/** עיגול עם האות הראשונה. חיווי קטן שאומר "יש כאן מישהו מחובר". */
function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center rounded-full bg-cobalt/10 font-display text-[11px] font-semibold text-cobalt"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
