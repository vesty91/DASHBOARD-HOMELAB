import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Badge, EmptyState, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import {
  INCIDENT_KIND_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_STATUS_TONES,
  formatIncidentDuration,
  formatIncidentTime,
} from "./labels";

export const dynamic = "force-dynamic";

async function resolveIntegrationLabels(
  caller: Awaited<ReturnType<typeof getBoardCaller>>,
  integrationIds: string[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  await Promise.all(
    integrationIds.map(async (id) => {
      try {
        const dto = await caller.integration.get({ id });
        labels.set(id, dto.name);
      } catch {
        labels.set(id, "Intégration");
      }
    }),
  );
  return labels;
}

export default async function IncidentsPage() {
  const caller = await getBoardCaller();
  const permissions = await caller.incident.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  const [openPage, recentPage] = await Promise.all([
    caller.incident.list({ status: "open", limit: 50 }),
    caller.incident.list({ status: "resolved", limit: 20 }),
  ]);

  const integrationIds = [
    ...new Set(
      [...openPage.items, ...recentPage.items]
        .map((item) => item.integrationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const integrationLabels = await resolveIntegrationLabels(caller, integrationIds);

  const sections = [
    { key: "open" as const, title: "Incidents ouverts", items: openPage.items },
    { key: "resolved" as const, title: "Récemment résolus", items: recentPage.items },
  ];

  const isEmpty = openPage.items.length === 0 && recentPage.items.length === 0;

  return (
    <PageContainer wide>
      <PageHeader
        title="Incidents"
        description="Suivi de disponibilité des intégrations : ouvertures et récupérations."
      />
      {isEmpty ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="Aucun incident"
          description="Les indisponibilités détectées apparaîtront ici automatiquement."
        />
      ) : (
        <div className="incident-sections">
          {sections.map((section) => (
            <section
              key={section.key}
              className="incident-section"
              aria-labelledby={`incident-${section.key}`}
            >
              <h2 id={`incident-${section.key}`} className="incident-section-title">
                {section.title}
              </h2>
              {section.items.length === 0 ? (
                <p className="incident-section-empty">Aucun élément.</p>
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table" data-testid={`incident-table-${section.key}`}>
                    <thead>
                      <tr>
                        <th scope="col">Intégration</th>
                        <th scope="col">Type</th>
                        <th scope="col">Statut</th>
                        <th scope="col">Ouverture</th>
                        <th scope="col">Durée</th>
                        <th scope="col">Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((incident) => {
                        const label = incident.integrationId
                          ? (integrationLabels.get(incident.integrationId) ?? "Intégration")
                          : "Intégration masquée";
                        return (
                          <tr key={incident.id} data-testid={`incident-row-${incident.id}`}>
                            <td>{label}</td>
                            <td>{INCIDENT_KIND_LABELS[incident.kind]}</td>
                            <td>
                              <Badge tone={INCIDENT_STATUS_TONES[incident.status]}>
                                {INCIDENT_STATUS_LABELS[incident.status]}
                              </Badge>
                            </td>
                            <td>{formatIncidentTime(incident.openedAt)}</td>
                            <td>
                              {formatIncidentDuration(incident.openedAt, incident.resolvedAt)}
                            </td>
                            <td>
                              <Link href={`/incidents/${incident.id}`}>Voir</Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
