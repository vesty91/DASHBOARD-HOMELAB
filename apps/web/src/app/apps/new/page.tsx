import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "../../../lib/server/board-api";
import { createAppAction } from "../actions";
import { AppForm } from "../app-form";
import { resolveAppLibraryTemplate } from "../resolve-app-library-template";

export default async function NewAppPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const caller = await getBoardCaller();
  if (!(await caller.app.canManage())) redirect("/forbidden");
  const { template: templateId } = await searchParams;
  const template = templateId
    ? await resolveAppLibraryTemplate(() => caller.app.library.get({ id: templateId }))
    : undefined;
  return (
    <PageContainer>
      <PageHeader
        title={template ? `Ajouter ${template.name}` : "Ajouter une App"}
        description={
          template
            ? "Vérifiez les métadonnées puis saisissez l'URL réelle de votre instance."
            : "Enregistrer un service ou un raccourci."
        }
      />
      <AppForm action={createAppAction} {...(template ? { template } : {})} />
    </PageContainer>
  );
}
