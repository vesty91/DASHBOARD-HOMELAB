import { canAssignGroupPermissionGrants, hasPermission } from "@dashboard/permissions";
import { Button, Field, Input, PageContainer, PageHeader, Select } from "@dashboard/ui";
import { requireAdminPagePermission } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { createGroupAction } from "./actions";
import { GroupPermissionGrantsForm } from "./group-permission-grants-form";

export default async function GroupsPage() {
  const session = await requireAdminPagePermission("group.read");
  const { authStore } = await getDatabase();
  const [groups, users, subject] = await Promise.all([
    authStore.listGroups(),
    authStore.listUsers(),
    authStore.resolvePermissionSubject(session.user.id),
  ]);
  const canManage = Boolean(subject && hasPermission(subject, "group.manage"));
  const canGrant = Boolean(subject && canAssignGroupPermissionGrants(subject));
  const grants = canGrant
    ? await Promise.all(
        groups.map(async (group) => ({
          id: group.id,
          permissions: await authStore.listGroupPermissionGrants(group.id),
        })),
      )
    : [];
  const grantsById = new Map(grants.map((entry) => [entry.id, entry.permissions]));
  return (
    <PageContainer>
      <PageHeader title="Groupes" description="Rôles partagés et appartenances." />
      {canManage ? (
        <form action={createGroupAction} className="ui-form ui-card ui-form-card ui-form-grid">
          <h2 className="ui-section-title">Créer un groupe</h2>
          <Field label="Nom">
            <Input required name="name" placeholder="Nom" />
          </Field>
          <Field label="Description">
            <Input name="description" placeholder="Description" />
          </Field>
          <Field label="Rôle">
            <Select name="role">
              <option>VIEWER</option>
              <option>USER</option>
              <option>EDITOR</option>
              <option>ADMIN</option>
            </Select>
          </Field>
          <Field label="Membre initial">
            <Select name="userId">
              <option value="">Sans membre initial</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" type="submit">
            Créer le groupe
          </Button>
        </form>
      ) : null}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Groupe</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td>{group.name}</td>
                <td>{group.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canGrant
        ? groups.map((group) => (
            <section key={group.id}>
              <h2 className="ui-section-title">{group.name}</h2>
              <GroupPermissionGrantsForm
                groupId={group.id}
                granted={grantsById.get(group.id) ?? []}
              />
            </section>
          ))
        : null}
    </PageContainer>
  );
}
