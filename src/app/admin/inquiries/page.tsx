"use client";

import AdminInquiries from "@/components/admin/AdminInquiries";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";

export default function AdminInquiriesPage() {
  return <AdminInquiries onAuthLost={reloadOnAuthLost} />;
}
