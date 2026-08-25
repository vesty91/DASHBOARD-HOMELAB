import Link from "next/link";
import { hasPermission, type Permission } from "@dashboard/permissions";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { LogoutButton } from "./logout-button";
const ADMIN_ENTRY_PERMISSIONS: readonly Permission[] = [
  "user.read",
  "group.read",
  "app.manage",
  "integration.manage",
];
export default async function AdminPage() {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");
  const { authStore } = await getDatabase();
  const subject = await authStore.resolvePermissionSubject(session.user.id);
  if (!subject || !ADMIN_ENTRY_PERMISSIONS.some((permission) => hasPermission(subject, permission)))
    redirect("/forbidden");
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Administration</h1>
      <nav className="my-8 flex gap-4">
        <Link href="/admin/users">Utilisateurs</Link>
        <Link href="/admin/groups">Groupes</Link>
        <Link href="/account/security">Sécurité</Link>
      </nav>
      <LogoutButton />
    </main>
  );
}
