"use client";

import OrderDetail from "@/components/admin/OrderDetail";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";

export default function OrderDetailClient({ id }: { id: string }) {
  return <OrderDetail id={id} onAuthLost={reloadOnAuthLost} />;
}
