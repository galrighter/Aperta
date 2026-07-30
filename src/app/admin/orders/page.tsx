"use client";

import AdminOrders from "@/components/admin/AdminOrders";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";

export default function AdminOrdersPage() {
  return <AdminOrders onAuthLost={reloadOnAuthLost} />;
}
