import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShellServer } from "@/components/shell/app-shell-server";

export const metadata: Metadata = {
  title: "Fiabilité",
};

export default function ReliabilityLayout({ children }: { children: ReactNode }) {
  return <AppShellServer>{children}</AppShellServer>;
}
