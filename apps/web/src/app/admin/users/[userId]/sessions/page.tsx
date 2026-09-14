import { Badge, Button, PageContainer, PageHeader } from "@dashboard/ui";
import { requireAdminPagePermission } from "@/lib/server/auth";
import { getBoardCaller } from "@/lib/server/board-api";
import { getDatabase } from "@/lib/server/database";
import { revokeAllUserSessionsAction, revokeUserSessionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function UserSessionsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdminPagePermission("session.manage");
  const { userId } = await params;
  const { authStore } = await getDatabase();
  const user = await authStore.findUser(userId);
  const sessions = await (await getBoardCaller()).session.listForUser({ userId });
  return (
    <PageContainer>
      <PageHeader
        title={`Sessions — ${user?.username ?? userId}`}
        description="Révocation administrative. Le secret de session n'est jamais affiché."
      />
      {sessions.length > 0 ? (
        <form action={revokeAllUserSessionsAction.bind(null, userId)}>
          <Button type="submit" variant="secondary">
            Révoquer toutes les sessions
          </Button>
        </form>
      ) : (
        <p className="ui-muted">Aucune session active.</p>
      )}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Créée</th>
              <th>Dernière activité</th>
              <th>Navigateur</th>
              <th>État</th>
              <th className="ui-table-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.createdAt}</td>
                <td>{session.lastSeenAt}</td>
                <td>{session.userAgent ?? "—"}</td>
                <td>
                  {session.current ? (
                    <Badge tone="success">Session actuelle</Badge>
                  ) : (
                    <Badge>Active</Badge>
                  )}
                </td>
                <td className="ui-table-actions">
                  <form action={revokeUserSessionAction.bind(null, userId, session.id)}>
                    <button type="submit" className="ui-btn-ghost">
                      Révoquer
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
