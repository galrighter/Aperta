"use client";

import { useCallback, useEffect, useState } from "react";
import { he } from "@/i18n/he";
import type { Inquiry, InquiryKind, InquiryStatus } from "@/lib/db/inquiries";
import AdminDesigns from "./AdminDesigns";
import AdminOrders from "./AdminOrders";
import { AdminLogin, type AdminAuth } from "./AdminGate";

const s = he.site;

const STATUSES: InquiryStatus[] = ["new", "contacted", "closed"];
const statusLabel: Record<InquiryStatus, string> = {
  new: s.adminStatusNew,
  contacted: s.adminStatusContacted,
  closed: s.adminStatusClosed,
};
const statusColor: Record<InquiryStatus, string> = {
  new: "bg-[#315bff]/20 text-[#204acc]",
  contacted: "bg-blue-100 text-blue-700",
  closed: "bg-stonesoft text-ink60",
};

type Auth = AdminAuth;
type Tab = "orders" | "inquiries" | "designs";

export default function AdminDashboard() {
  const [auth, setAuth] = useState<Auth>("checking");
  // ההזמנות ראשונות, וכברירת מחדל: זה מה שמחפשים כשנכנסים לבק־אופיס.
  const [tab, setTab] = useState<Tab>("orders");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<InquiryStatus | "">("");
  /** מאז שההזמנות קיבלו טבלה ולשונית משלהן, מה שנשאר כאן הוא פניות יצירת קשר
   *  — ועימן ההזמנות ההיסטוריות שנכתבו לטבלה הזאת לפני המעבר. לכן ברירת המחדל
   *  היא "הכול", וסינון "הזמנות" מראה בדיוק את הישנות. */
  const [kind, setKind] = useState<InquiryKind | "">("");
  const [listError, setListError] = useState<string | null>(null);

  const load = useCallback(async (status: InquiryStatus | "", k: InquiryKind | "") => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (k) params.set("kind", k);
    const qs = params.toString();
    const res = await fetch(`/api/inquiries${qs ? `?${qs}` : ""}`);
    if (res.status === 401) {
      setAuth("out");
      return;
    }
    if (res.status === 503) {
      setAuth("disabled");
      return;
    }
    if (!res.ok) {
      setListError(s.adminLoadError);
      return;
    }
    const body = (await res.json()) as { inquiries: Inquiry[] };
    setInquiries(body.inquiries);
    setListError(null);
    setAuth("in");
  }, []);

  useEffect(() => {
    void load("", "");
  }, [load]);

  async function onLogout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    setInquiries([]);
    setAuth("out");
  }

  async function changeStatus(id: string, status: InquiryStatus) {
    const res = await fetch(`/api/inquiries/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setInquiries((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status } : q)),
      );
    }
  }

  function applyFilter(f: InquiryStatus | "") {
    setFilter(f);
    void load(f, kind);
  }

  function applyKind(k: InquiryKind | "") {
    setKind(k);
    void load(filter, k);
  }

  if (auth !== "in") {
    return <AdminLogin auth={auth} onAuthed={() => load(filter, kind)} />;
  }

  // auth === "in"
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-graphite/10">
        <div className="flex gap-6">
          {([
            ["orders", s.adminTabOrders],
            ["inquiries", s.adminTabInquiries],
            ["designs", s.adminTabDesigns],
          ] as const).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${
                  tab === key
                    ? "border-b-graphite font-semibold text-graphite"
                    : "border-b-transparent text-ink60 hover:text-graphite"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <button onClick={onLogout} className="pb-2.5 text-sm text-ink60 hover:text-graphite">
          {s.adminLogout}
        </button>
      </div>

      {tab === "orders" ? (
        <AdminOrders onAuthLost={setAuth} />
      ) : tab === "designs" ? (
        <AdminDesigns onAuthLost={setAuth} />
      ) : (
        <Inquiries
          inquiries={inquiries}
          filter={filter}
          kind={kind}
          onFilter={applyFilter}
          onKind={applyKind}
          onStatus={changeStatus}
          listError={listError}
        />
      )}
    </div>
  );
}

function Inquiries({
  inquiries, filter, kind, onFilter, onKind, onStatus, listError,
}: {
  inquiries: Inquiry[];
  filter: InquiryStatus | "";
  kind: InquiryKind | "";
  onFilter: (f: InquiryStatus | "") => void;
  onKind: (k: InquiryKind | "") => void;
  onStatus: (id: string, status: InquiryStatus) => void;
  listError: string | null;
}) {
  return (
    <div>
      {/* סוג הפנייה — הזמנה שבוצעה בפועל מול פניית יצירת קשר */}
      <div className="mb-3 flex flex-wrap gap-2">
        {([["order", s.adminFilterOrders], ["contact", s.adminFilterContact], ["", s.adminFilterAll]] as const).map(
          ([k, label]) => (
            <button
              key={k || "all"}
              onClick={() => onKind(k)}
              aria-pressed={kind === k}
              className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors ${
                kind === k
                  ? "bg-cobalt text-white"
                  : "bg-porcelain text-ink60 hover:bg-stonesoft"
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(["", ...STATUSES] as const).map((f) => (
          <button
            key={f || "all"}
            onClick={() => onFilter(f)}
            className={`rounded-[2px] px-3 py-1.5 text-sm transition-colors ${
              filter === f
                ? "bg-graphite text-porcelain"
                : "bg-porcelain text-ink60 hover:bg-stonesoft"
            }`}
          >
            {f === "" ? s.adminFilterAll : statusLabel[f]}
          </button>
        ))}
      </div>

      {listError && <p className="mb-4 text-sm text-red-600">{listError}</p>}

      {inquiries.length === 0 ? (
        <p className="text-ink60">{s.adminEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-graphite/10 text-right text-xs text-mist">
                <th className="py-2 pl-3 font-medium">{s.adminColDate}</th>
                <th className="py-2 pl-3 font-medium">{s.adminColKind}</th>
                <th className="py-2 pl-3 font-medium">{s.adminColContact}</th>
                <th className="py-2 pl-3 font-medium">{s.adminColProduct}</th>
                <th className="py-2 pl-3 font-medium">{s.adminColMessage}</th>
                <th className="py-2 pl-3 font-medium">{s.adminColStatus}</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((q) => (
                <tr key={q.id} className="border-b border-graphite/10 align-top">
                  <td className="py-3 pl-3 whitespace-nowrap text-ink60">
                    {new Date(q.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="py-3 pl-3 whitespace-nowrap text-ink60">
                    {q.kind === "order" ? s.adminKindOrder : s.adminKindContact}
                  </td>
                  <td className="py-3 pl-3">
                    <div className="font-medium text-graphite">{q.name}</div>
                    <a href={`mailto:${q.email}`} dir="ltr" className="block text-ink60 hover:underline">
                      {q.email}
                    </a>
                    {q.phone && <div dir="ltr" className="text-ink60">{q.phone}</div>}
                  </td>
                  <td className="py-3 pl-3 whitespace-nowrap text-ink60">
                    {q.product_type === "bracelet"
                      ? he.bracelet
                      : q.product_type === "ring"
                        ? he.ring
                        : "—"}
                  </td>
                  <td className="py-3 pl-3 text-ink80">
                    <div className="max-w-xs whitespace-pre-wrap">{q.message}</div>
                  </td>
                  <td className="py-3 pl-3">
                    <select
                      value={q.status}
                      onChange={(e) => onStatus(q.id, e.target.value as InquiryStatus)}
                      className={`rounded-[2px] px-3 py-1 text-xs font-medium ${statusColor[q.status]}`}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {statusLabel[st]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
