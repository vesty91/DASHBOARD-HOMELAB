import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "../../../lib/server/board-api";
import { createAppAction } from "../actions";
import { AppForm } from "../app-form";

export default async function NewAppPage() {
  if (!(await (await getBoardCaller()).app.canManage())) redirect("/forbidden");
  return (
    <PageContainer>
      <PageHeader title="Ajouter une App" description="Enregistrer un service ou un raccourci." />
      <AppForm action={createAppAction} />
    </PageContainer>
  );
}
