import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { AutomationWizard } from "../automation-wizard";

export const dynamic = "force-dynamic";

export default async function NewAutomationPage() {
  const caller = await getBoardCaller();
  const [permissions, catalog, integrations] = await Promise.all([
    caller.automation.permissions(),
    caller.automation.catalog().catch(() => null),
    caller.integration.list({ limit: 100 }).catch(() => ({
      items: [] as Array<{
        id: string;
        name: string;
        type: string;
      }>,
    })),
  ]);
  if (!permissions.canManage) redirect("/forbidden");
  if (!catalog) redirect("/forbidden");

  return (
    <PageContainer>
      <PageHeader
        title="Nouvelle automation"
        description="Assistant en 7 étapes. La règle est enregistrée désactivée."
      />
      <AutomationWizard
        actions={catalog.actions}
        integrations={integrations.items.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
        }))}
      />
    </PageContainer>
  );
}
