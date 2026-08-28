import { hasPermission } from "@dashboard/permissions";
import { Badge, Button, Field, Input, PageContainer, PageHeader, Select } from "@dashboard/ui";
import { requireAdminPagePermission } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { createUserAction, setStatusAction } from "./actions";

export default async function UsersPage() {
  const session = await requireAdminPagePermission("user.read");
  const { authStore } = await getDatabase();
  const [users, subject] = await Promise.all([
    authStore.listUsers(),
    authStore.resolvePermissionSubject(session.user.id),
  ]);
  const canManage = Boolean(subject && hasPermission(subject, "user.manage"));
  return (
    <PageContainer>
      <PageHeader title="Utilisateurs" description="Comptes locaux de l'instance." />
      {canManage ? (
        <form action={createUserAction} className="ui-form ui-card ui-form-card ui-form-grid">
          <h2 className="ui-section-title">Créer un utilisateur local</h2>
          <Field label="Identifiant">
            <Input name="username" required placeholder="Identifiant" />
          </Field>
          <Field label="Nom affiché">
            <Input name="displayName" placeholder="Nom affiché" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" placeholder="Email" />
          </Field>
          <Field label="Mot de passe initial">
            <Input
              name="password"
              type="password"
              minLength={12}
              required
              placeholder="Mot de passe initial"
            />
          </Field>
          <Field label="Rôle">
            <Select name="role">
              <option>VIEWER</option>
              <option>USER</option>
              <option>EDITOR</option>
              <option>ADMIN</option>
            </Select>
          </Field>
          <Button variant="primary" type="submit">
            Créer
          </Button>
        </form>
      ) : null}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Nom affiché</th>
              <th>Statut</th>
              {canManage ? <th className="ui-table-actions">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
                    {user.username}
                    {user.isSystemAdmin ? <Badge tone="accent">Admin système</Badge> : null}
                  </span>
                </td>
                <td>{user.displayName ?? "—"}</td>
                <td>
                  <Badge tone={user.status === "active" ? "success" : "warning"}>
                    {user.status === "active" ? "Actif" : "Désactivé"}
                  </Badge>
                </td>
                {canManage ? (
                  <td className="ui-table-actions">
                    <form action={setStatusAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={user.status === "active" ? "disabled" : "active"}
                      />
                      <button type="submit" className="ui-btn-ghost">
                        {user.status === "active" ? "Désactiver" : "Activer"}
                      </button>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
