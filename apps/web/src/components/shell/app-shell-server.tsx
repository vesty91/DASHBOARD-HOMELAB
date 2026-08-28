import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
import { getShellContext } from "./get-shell-context";

export async function AppShellServer({ children }: { children: ReactNode }) {
  const { user, nav } = await getShellContext();
  return (
    <AppShell user={user} nav={nav}>
      {children}
    </AppShell>
  );
}
