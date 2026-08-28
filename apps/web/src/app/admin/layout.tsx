import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellServer } from "@/components/shell/app-shell-server";
import { requireSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");
  return <AppShellServer>{children}</AppShellServer>;
}
