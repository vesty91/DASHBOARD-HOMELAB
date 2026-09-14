import { isAuditAction } from "@dashboard/auth";
import { Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { requireAdminPagePermission } from "@/lib/server/auth";
import { getBoardCaller } from "@/lib/server/board-api";

export const dynamic = "force-dynamic";

export default async function AuditAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; cursor?: string }>;
}) {
  await requireAdminPagePermission("audit.read");
  const params = await searchParams;
  const result = await (
    await getBoardCaller()
  ).audit.list({
    limit: 50,
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.action && isAuditAction(params.action) ? { action: params.action } : {}),
  });
  return (
    <PageContainer>
      <PageHeader
        title="Journal d'audit"
        description="Événements serveur. Les secrets, tokens et cookies ne sont jamais enregistrés."
      />
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Horodatage</th>
              <th>Action</th>
              <th>Résultat</th>
              <th>Cible</th>
              <th>Acteur</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((event) => (
              <tr key={event.id}>
                <td>{event.createdAt}</td>
                <td>{event.action}</td>
                <td>
                  <Badge
                    tone={
                      event.outcome === "success"
                        ? "success"
                        : event.outcome === "denied"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {event.outcome}
                  </Badge>
                </td>
                <td>
                  {event.targetType}
                  {event.targetId ? ` ${event.targetId.slice(0, 8)}` : ""}
                </td>
                <td>{event.actorUserId ? event.actorUserId.slice(0, 8) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.nextCursor ? (
        <p className="ui-muted">
          <a href={`/admin/audit?cursor=${encodeURIComponent(result.nextCursor)}`}>Page suivante</a>
        </p>
      ) : null}
    </PageContainer>
  );
}
