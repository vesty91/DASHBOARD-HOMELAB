import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "../../../lib/server/board-api";
import { createIntegrationAction } from "../actions";
import { IntegrationForm } from "../integration-form";

export default async function NewIntegrationPage() {
  const caller = await getBoardCaller();
  if (!(await caller.integration.canCreate())) redirect("/forbidden");
  const catalog = await caller.integration.catalog();
  return (
    <PageContainer>
      <PageHeader title="Ajouter une intégration" />
      {catalog.length === 0 ? (
        <p>Aucun type d&apos;intégration disponible.</p>
      ) : (
        <IntegrationForm action={createIntegrationAction} catalog={catalog} />
      )}
    </PageContainer>
  );
}
