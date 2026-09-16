import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { cancelMaintenanceFormAction } from "../../actions";
import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUS_TONES,
  formatStatusTime,
} from "../../labels";

export const dynamic = "force-dynamic";

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await getBoardCaller();
  const permissions = await caller.statusPage.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  let maintenance;
  try {
    maintenance = await caller.statusPage.getMaintenance({ id });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <PageContainer>
      <PageHeader
        title={maintenance.name}
        description="Fenêtre de maintenance (horaires UTC)."
        actions={
          <Link className="ui-btn ui-btn-secondary" href="/status-pages">
            Retour aux status pages
          </Link>
        }
      />
      <section className="ui-card ui-form-card">
        <dl className="status-page-summary">
          <div>
            <dt>Statut</dt>
            <dd>
              <Badge tone={MAINTENANCE_STATUS_TONES[maintenance.status]}>
                {MAINTENANCE_STATUS_LABELS[maintenance.status]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Début</dt>
            <dd>{formatStatusTime(maintenance.startsAt)}</dd>
          </div>
          <div>
            <dt>Fin</dt>
            <dd>{formatStatusTime(maintenance.endsAt)}</dd>
          </div>
          <div>
            <dt>Cibles</dt>
            <dd>{maintenance.integrationIds.length} intégration(s)</dd>
          </div>
        </dl>
        {maintenance.description ? <p>{maintenance.description}</p> : null}
        {permissions.canManage &&
        (maintenance.status === "scheduled" || maintenance.status === "active") ? (
          <form action={cancelMaintenanceFormAction} style={{ marginTop: "1rem" }}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="ui-btn ui-btn-danger">
              Annuler la maintenance
            </button>
          </form>
        ) : null}
      </section>
    </PageContainer>
  );
}
