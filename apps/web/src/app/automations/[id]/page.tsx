import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { AutomationDetail } from "./automation-detail";

export const dynamic = "force-dynamic";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await getBoardCaller();
  const permissions = await caller.automation.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  try {
    const [rule, runs] = await Promise.all([
      caller.automation.get({ id }),
      caller.automation.listRuns({ id, limit: 50 }),
    ]);
    return (
      <PageContainer>
        <PageHeader
          title={rule.name}
          description={rule.description ?? "Détail, historique et contrôles d’exécution."}
          actions={
            <Link className="ui-btn ui-btn-secondary" href="/automations">
              Retour à la liste
            </Link>
          }
        />
        <AutomationDetail
          rule={rule}
          runs={runs}
          canManage={permissions.canManage}
          canRun={permissions.canRun}
        />
      </PageContainer>
    );
  } catch {
    redirect("/automations");
  }
}
