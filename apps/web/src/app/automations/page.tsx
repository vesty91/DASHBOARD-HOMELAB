import Link from "next/link";
import { redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { Badge, EmptyState, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { TRIGGER_LABELS, formatTimestamp } from "./automation-labels";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const caller = await getBoardCaller();
  const permissions = await caller.automation.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  const rules = await caller.automation.list();

  return (
    <PageContainer>
      <PageHeader
        title="Automations"
        description="Règles déclaratives pour planifier, réagir aux événements et publier des alertes."
        {...(permissions.canManage
          ? {
              actions: (
                <Link className="ui-btn ui-btn-primary" href="/automations/new">
                  Nouvelle automation
                </Link>
              ),
            }
          : {})}
      />
      {rules.length === 0 ? (
        <EmptyState
          icon={<Workflow />}
          title="Aucune automation"
          description={
            permissions.canManage
              ? "Créez une règle pour démarrer. Les nouvelles automations sont désactivées par défaut."
              : "Aucune règle n’est disponible pour le moment."
          }
        />
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">État</th>
                <th scope="col">Déclencheur</th>
                <th scope="col">Action</th>
                <th scope="col">Dernière exécution</th>
                <th scope="col">Statut</th>
                <th scope="col">Prochaine</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <Link href={`/automations/${rule.id}`}>{rule.name}</Link>
                  </td>
                  <td>
                    <Badge tone={rule.enabled ? "success" : "neutral"}>
                      {rule.enabled ? "Activée" : "Désactivée"}
                    </Badge>
                  </td>
                  <td>{TRIGGER_LABELS[rule.triggerType]}</td>
                  <td>
                    <code>{rule.actionType}</code>
                  </td>
                  <td>{formatTimestamp(rule.lastCompletedAt ?? rule.lastTriggeredAt)}</td>
                  <td>{rule.lastRunStatus ?? "—"}</td>
                  <td>{rule.triggerType === "schedule" ? formatTimestamp(rule.nextRunAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
