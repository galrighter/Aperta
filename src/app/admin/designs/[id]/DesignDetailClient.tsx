"use client";

import DesignDetail from "@/components/admin/DesignDetail";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";

export default function DesignDetailClient({ id }: { id: string }) {
  return <DesignDetail id={id} onAuthLost={reloadOnAuthLost} />;
}
