import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { StatusPageCreateForm } from "./status-page-create-form";

export const dynamic = "force-dynamic";

export default async function NewStatusPage() {
  const caller = await getBoardCaller();
  const permissions = await caller.statusPage.permissions();
  if (!permissions.canManage) redirect("/forbidden");

  return (
    <PageContainer>
      <PageHeader
        title="Nouvelle status page"
        description="Créée privée par défaut. Ajoutez des services puis publiez explicitement."
      />
      <StatusPageCreateForm />
    </PageContainer>
  );
}
