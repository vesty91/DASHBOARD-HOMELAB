import "server-only";
import { hasPermission } from "@dashboard/permissions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";

export type ShellUser = {
  username: string;
  displayName: string | null;
};

export type ShellNav = {
  boards: boolean;
  apps: boolean;
  integrations: boolean;
  users: boolean;
  groups: boolean;
  account: boolean;
};

export async function getShellContext(): Promise<{ user: ShellUser | null; nav: ShellNav }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      user: null,
      nav: {
        boards: false,
        apps: false,
        integrations: false,
        users: false,
        groups: false,
        account: false,
      },
    };
  }
  const { authStore } = await getDatabase();
  const subject = await authStore.resolvePermissionSubject(session.user.id);
  const active = Boolean(subject && subject.status === "active");
  return {
    user: {
      username: session.user.username,
      displayName: session.user.displayName,
    },
    nav: {
      boards: active,
      apps: Boolean(subject && hasPermission(subject, "app.read")),
      integrations: Boolean(subject && hasPermission(subject, "integration.read")),
      users: Boolean(subject && hasPermission(subject, "user.read")),
      groups: Boolean(subject && hasPermission(subject, "group.read")),
      account: active,
    },
  };
}
