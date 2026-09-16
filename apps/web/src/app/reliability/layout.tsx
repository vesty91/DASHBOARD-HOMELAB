import type { ReactNode } from "react";
import { AppShellServer } from "@/components/shell/app-shell-server";

export default function ReliabilityLayout({ children }: { children: ReactNode }) {
  return <AppShellServer>{children}</AppShellServer>;
}
