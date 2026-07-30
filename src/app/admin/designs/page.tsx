"use client";

import AdminDesigns from "@/components/admin/AdminDesigns";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";

export default function AdminDesignsPage() {
  return <AdminDesigns onAuthLost={reloadOnAuthLost} />;
}
