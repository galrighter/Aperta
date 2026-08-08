"use client";

import UserDetail from "@/components/admin/UserDetail";
import { reloadOnAuthLost } from "@/components/admin/AdminShell";

export default function UserDetailClient({ id }: { id: string }) {
  return <UserDetail id={id} onAuthLost={reloadOnAuthLost} />;
}
