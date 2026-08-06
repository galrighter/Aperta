"use client";

import { useCallback, useState } from "react";
import { he } from "@/i18n/he";
import { useAdminData } from "@/lib/client/useAdminData";

const s = he.site;

export type AdminAuth = "checking" | "in" | "out" | "disabled";

/** טופס הכניסה ומצבי הביניים שלו. מופרד מהדשבורד כי גם `/debug` צריך אותו,
 *  ושני שערים שנראים אחרת הם שני שערים שמתחזקים אחרת. */
export function AdminLogin({
  auth,
  onAuthed,
}: {
  auth: Exclude<AdminAuth, "in">;
  onAuthed: () => void | Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (auth === "checking") {
    return <p className="text-ink60">{he.loading}</p>;
  }

  if (auth === "disabled") {
    return (
      <p className="rounded-[2px] border border-graphite/10 bg-porcelain p-4 text-sm text-ink60">
        {s.adminDisabled}
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      setError(res.status === 503 ? s.adminDisabled : s.adminBadToken);
      return;
    }
    setToken("");
    await onAuthed();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-8 flex max-w-sm flex-col gap-4">
      <h2 className="text-lg font-semibold text-graphite">{s.adminLoginTitle}</h2>
      <div>
        <label htmlFor="admin-token" className="mb-1 block text-sm font-medium text-ink80">
          {s.adminTokenLabel}
        </label>
        <input
          id="admin-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full rounded-[2px] border border-graphite/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#3f6297] focus:ring-2 focus:ring-[#3f6297]/20"
          dir="ltr"
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="rounded-[2px] bg-graphite px-6 py-3 text-sm font-medium text-porcelain hover:bg-graphite/90"
      >
        {s.adminLogin}
      </button>
    </form>
  );
}

/** עוטף עמוד שלם: בודק את הסשן מול `GET /api/admin/session` ומרנדר את התוכן
 *  רק אחרי כניסה. השער האמיתי הוא `requireAdmin` בצד השרת — זה רק מה שהמשתמש
 *  רואה, כדי שדף מוגן לא ייראה כמו דף שבור. */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AdminAuth>("checking");

  // שלושת המצבים נגזרים מאותה קריאה: הצלחה = בפנים, 401/503 מגיעים דרך
  // `onAuthLost` עם ההבחנה ביניהם, וכל השאר — כולל כשל רשת — הוא "בחוץ".
  // כשל רשת אינו "אין הרשאה", אבל טופס הכניסה הוא המסך הנכון גם עבורו: הוא
  // ניתן לניסיון חוזר, בעוד מסך שגיאה הוא מבוי סתום.
  const { refresh } = useAdminData<unknown>("/api/admin/session", {
    onSuccess: () => setAuth("in"),
    onAuthLost: setAuth,
    onError: () => setAuth("out"),
  });

  const check = useCallback(async () => {
    await refresh();
  }, [refresh]);

  if (auth === "in") return <>{children}</>;
  return (
    <div dir="rtl" className="mx-auto max-w-5xl p-4">
      <AdminLogin auth={auth} onAuthed={check} />
    </div>
  );
}
