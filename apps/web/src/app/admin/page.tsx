import Link from "next/link";
import { hasPermission, type Permission } from "@dashboard/permissions";
import { redirect } from "next/navigation";
import { KeyRound, Plug, Users, UsersRound } from "lucide-react";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";

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
  const canUsers = hasPermission(subject, "user.read");
  const canGroups = hasPermission(subject, "group.read");
  const canIntegrations =
    hasPermission(subject, "integration.manage") || hasPermission(subject, "integration.read");
  return (
    <PageContainer>
      <PageHeader
        title="Administration"
        description="Gestion des utilisateurs, des groupes et des accès."
      />
      <section className="home-grid">
        {canUsers ? (
          <Link href="/admin/users" className="shortcut-card">
            <span className="shortcut-card-icon" aria-hidden="true">
              <Users />
            </span>
            <span className="shortcut-card-copy">
              <span className="ui-card-title">Utilisateurs</span>
              <span className="ui-muted">Comptes locaux et statuts.</span>
            </span>
          </Link>
        ) : null}
        {canGroups ? (
          <Link href="/admin/groups" className="shortcut-card">
            <span className="shortcut-card-icon" aria-hidden="true">
              <UsersRound />
            </span>
            <span className="shortcut-card-copy">
              <span className="ui-card-title">Groupes</span>
              <span className="ui-muted">Rôles et appartenances.</span>
            </span>
          </Link>
        ) : null}
        {canIntegrations ? (
          <Link href="/integrations" className="shortcut-card">
            <span className="shortcut-card-icon" aria-hidden="true">
              <Plug />
            </span>
            <span className="shortcut-card-copy">
              <span className="ui-card-title">Intégrations</span>
              <span className="ui-muted">Connexions externes.</span>
            </span>
          </Link>
        ) : null}
        <Link href="/account/security" className="shortcut-card">
          <span className="shortcut-card-icon" aria-hidden="true">
            <KeyRound />
          </span>
          <span className="shortcut-card-copy">
            <span className="ui-card-title">Sécurité</span>
            <span className="ui-muted">Mot de passe du compte.</span>
          </span>
        </Link>
      </section>
    </PageContainer>
  );
}
