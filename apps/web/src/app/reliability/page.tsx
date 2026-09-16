import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { Badge, EmptyState, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { formatBasisPoints, sloStatusLabel, sloStatusTone } from "./labels";

export const dynamic = "force-dynamic";

export default async function ReliabilityOverviewPage() {
  const caller = await getBoardCaller();
  const permissions = await caller.reliability.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  const [summary, integrationsPage] = await Promise.all([
    caller.reliability.summarize({ windowDays: 30 }),
    caller.integration.list({ limit: 100 }),
  ]);

  const integrationLabels = new Map(
    integrationsPage.items.map((item) => [item.id, `${item.name} (${item.type})`]),
  );

  const services = summary.services.sort((a, b) => {
    const labelA = integrationLabels.get(a.serviceKey) ?? a.serviceKey;
    const labelB = integrationLabels.get(b.serviceKey) ?? b.serviceKey;
    return labelA.localeCompare(labelB, "fr");
  });

  return (
    <PageContainer wide>
      <PageHeader
        title="Fiabilité"
        description="Disponibilité quotidienne UTC et suivi SLO dérivés des incidents et maintenances."
      />
      {services.length === 0 ? (
        <EmptyState
          icon={<Gauge />}
          title="Aucun service"
          description="Ajoutez des intégrations pour commencer le suivi de fiabilité."
        />
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table" data-testid="reliability-overview-table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Disponibilité (30 j)</th>
                <th scope="col">SLO</th>
                <th scope="col">État SLO</th>
                <th scope="col">Budget restant</th>
                <th scope="col">Détail</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const label = integrationLabels.get(service.serviceKey) ?? "Intégration";
                return (
                  <tr
                    key={service.serviceKey}
                    data-testid={`reliability-row-${service.serviceKey}`}
                  >
                    <td>{label}</td>
                    <td>{formatBasisPoints(service.availabilityBasisPoints)}</td>
                    <td>{service.slo?.name ?? "—"}</td>
                    <td>
                      <Badge tone={sloStatusTone(service.sloMet)}>
                        {sloStatusLabel(service.sloMet)}
                      </Badge>
                    </td>
                    <td>{formatBasisPoints(service.remainingBudgetBasisPoints)}</td>
                    <td>
                      <Link href={`/reliability/${service.serviceKey}`}>Voir</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
