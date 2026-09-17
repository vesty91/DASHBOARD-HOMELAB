import { redirect } from "next/navigation";
import { Network } from "lucide-react";
import { EmptyState, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { TopologyPanel } from "./topology-panel";

export const dynamic = "force-dynamic";

export default async function TopologyPage() {
  const caller = await getBoardCaller();
  const permissions = await caller.topology.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  const [dependencies, impact, integrationsPage] = await Promise.all([
    caller.topology.list({ limit: 500 }),
    caller.topology.analyzeImpact({}),
    caller.integration.list({ limit: 100 }),
  ]);

  const services = integrationsPage.items
    .map((item) => ({
      id: item.id,
      label: `${item.name} (${item.type})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const isEmpty = services.length === 0 && dependencies.length === 0;

  return (
    <PageContainer wide>
      <PageHeader
        title="Topologie"
        description="Dépendances curatées manuellement, rayon d’impact et candidats de cause racine (heuristiques)."
      />
      {isEmpty ? (
        <EmptyState
          icon={<Network />}
          title="Aucune topologie"
          description={
            permissions.canManage
              ? "Ajoutez des intégrations, puis créez des dépendances explicites. Aucune découverte automatique."
              : "Aucune dépendance n’est disponible pour le moment."
          }
        />
      ) : (
        <TopologyPanel
          services={services}
          dependencies={dependencies.map((edge) => ({
            id: edge.id,
            upstreamServiceKey: edge.upstreamServiceKey,
            downstreamServiceKey: edge.downstreamServiceKey,
            relationship: edge.relationship,
          }))}
          impactServices={impact.services}
          candidateRootCause={impact.candidateRootCause}
          truncated={impact.truncated}
          canManage={permissions.canManage}
        />
      )}
    </PageContainer>
  );
}
