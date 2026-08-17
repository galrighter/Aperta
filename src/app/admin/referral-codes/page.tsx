"use client";

import AdminReferralCodes from "@/components/admin/AdminReferralCodes";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";

export default function AdminReferralCodesPage() {
  return <AdminReferralCodes onAuthLost={reloadOnAuthLost} />;
}
