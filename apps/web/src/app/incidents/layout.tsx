import type { ReactNode } from "react";
import { AppShellServer } from "@/components/shell/app-shell-server";

export default function IncidentsLayout({ children }: { children: ReactNode }) {
  return <AppShellServer>{children}</AppShellServer>;
}
