"use client";

import AdminUsers from "@/components/admin/AdminUsers";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";
import { he } from "@/i18n/he";

export default function AdminUsersPage() {
  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight text-graphite">
          {he.site.adminUsersTitle}
        </h1>
        <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-ink60">
          {he.site.adminUsersSubtitle}
        </p>
      </div>
      <AdminUsers onAuthLost={reloadOnAuthLost} />
    </div>
  );
}
