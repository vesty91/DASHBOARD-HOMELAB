import type { ReactNode } from "react";
import { AppShellServer } from "@/components/shell/app-shell-server";

export default function DashboardSectionLayout({ children }: { children: ReactNode }) {
  return <AppShellServer>{children}</AppShellServer>;
}
