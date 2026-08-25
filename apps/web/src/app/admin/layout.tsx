import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/server/auth";
export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");
  if (!session.user.isSystemAdmin) redirect("/forbidden");
  return children;
}
