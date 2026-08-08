"use client";

// רשימת המשתמשים: מי נרשם, מתי, ומתי נראה לאחרונה.
//
// **החיפוש והמיון יושבים בשרת ולא בדפדפן.** סינון של רשימה מעומדת הוא סינון
// של העמוד שנטען בלבד — "אין תוצאות" היה נאמר על מי שפשוט לא ירד עדיין. לכן
// כל שינוי במסנן הוא מפתח חדש ובקשה חדשה, ו-`useAdminPages` מאפס אליה.
//
// ההשהיה בהקלדה היא כדי שכל תו לא יהיה בקשה. 300ms — קצר מספיק כדי שהתוצאה
// תרגיש מיידית, ארוך מספיק כדי ששם מלא יהיה בקשה אחת ולא שמונה.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminPages } from "@/lib/client/useAdminData";
import { he } from "@/i18n/he";
import type { AdminUserRow, UserSort } from "@/lib/db/users";
import type { AccountKind } from "@/lib/db/accounts";
import { UserEmail, UserName, agoText, shortDate } from "./userView";

const s = he.site;

const PAGE = 25;
const DEBOUNCE_MS = 300;

const SORTS: Array<[UserSort, string]> = [
  ["created", s.adminUsersSortCreated],
  ["active", s.adminUsersSortActive],
];

const KINDS: Array<[AccountKind | "", string]> = [
  ["", s.adminFilterAll],
  ["friend", s.adminUsersKindFriend],
  ["tester", s.adminUsersKindTester],
];

export default function AdminUsers({
  onAuthLost,
}: {
  onAuthLost: (state: "out" | "disabled") => void;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<UserSort>("created");
  const [kind, setKind] = useState<AccountKind | "">("");

  useEffect(() => {
    const id = setTimeout(() => setQuery(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term]);

  const { pages, error, schemaOutdated, isLoading, isValidating, loadMore } = useAdminPages<{
    users: AdminUserRow[];
    total: number;
  }>(
    (index) => {
      const params = new URLSearchParams({
        limit: String(PAGE),
        offset: String(index * PAGE),
        sort,
      });
      if (query) params.set("q", query);
      if (kind) params.set("kind", kind);
      return `/api/admin/users?${params.toString()}`;
    },
    { onAuthLost },
  );

  const users = useMemo(() => pages?.flatMap((p) => p.users) ?? [], [pages]);
  const total = pages?.[0]?.total ?? 0;
  // "מחפש" ולא "אין תוצאות": בזמן שהבקשה בדרך אין עדיין תשובה על השאלה.
  const searching = query.length > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={s.adminUsersSearch}
            aria-label={s.adminUsersSearch}
            className="w-full rounded-[2px] border border-graphite/20 bg-white px-3 py-2 text-sm text-graphite placeholder:text-mist focus:border-lapis focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={s.adminUsersSortLabel}>
          {SORTS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              aria-pressed={sort === value}
              className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors ${
                sort === value ? "bg-graphite text-porcelain" : "bg-porcelain text-ink60 hover:bg-stonesoft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {KINDS.map(([value, label]) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors ${
              kind === value ? "bg-lapis text-white" : "bg-porcelain text-ink60 hover:bg-stonesoft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {schemaOutdated ? (
        <p className="text-sm text-[#c0413b]">{s.adminUsersSchema}</p>
      ) : error ? (
        <p className="text-sm text-[#c0413b]">{s.adminUsersError}</p>
      ) : isLoading && users.length === 0 ? (
        <p className="text-ink60">{he.loading}</p>
      ) : users.length === 0 ? (
        <p className="text-ink60">{searching ? s.adminUsersNoMatch : s.adminUsersEmpty}</p>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-mist">
            {s.adminShowing} {users.length} {s.adminOf} {total}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-graphite/10 text-right text-xs text-mist">
                  <th className="py-2 pl-3 font-medium">{s.adminUserColName}</th>
                  <th className="py-2 pl-3 font-medium">{s.adminUserColEmail}</th>
                  <th className="py-2 pl-3 font-medium">{s.adminUserColJoined}</th>
                  <th className="py-2 pl-3 font-medium">{s.adminUserColActive}</th>
                  <th className="py-2 pl-3 font-medium">{s.adminUserColDesigns}</th>
                  <th className="py-2 pl-3 font-medium">{s.adminUserColOrders}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-graphite/10 align-top hover:bg-porcelain">
                    <td className="py-3 pl-3">
                      <Link href={`/admin/users/${u.id}`} className="hover:underline">
                        <UserName user={u} />
                      </Link>
                      {u.phone && (
                        <div className="mt-0.5 text-[13px] text-ink60">
                          <bdi>{u.phone}</bdi>
                        </div>
                      )}
                    </td>
                    <td className="py-3 pl-3">
                      <UserEmail email={u.email} />
                    </td>
                    <td className="py-3 pl-3 whitespace-nowrap text-ink60">
                      {shortDate(u.created_at)}
                    </td>
                    <td className="py-3 pl-3 whitespace-nowrap text-ink60">
                      {shortDate(u.last_seen_at)}
                      <div className="text-[12px] text-mist">{agoText(u.last_seen_at)}</div>
                    </td>
                    <td className="py-3 pl-3 text-ink60">{u.designs}</td>
                    <td className="py-3 pl-3 text-ink60">{u.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length < total && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={isValidating}
              className="mt-6 rounded-[2px] border border-graphite/25 px-6 py-3 text-sm text-graphite transition-colors hover:bg-porcelain disabled:opacity-50"
            >
              {isValidating ? he.loading : s.adminMore}
            </button>
          )}
        </>
      )}
    </div>
  );
}
