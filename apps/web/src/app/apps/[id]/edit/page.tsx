import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "../../../../lib/server/board-api";
import { updateAppAction } from "../../actions";
import { AppForm } from "../../app-form";

export default async function EditAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caller = await getBoardCaller();
  if (!(await caller.app.canManage())) redirect("/forbidden");
  const app = await caller.app.get({ id });
  return (
    <PageContainer>
      <PageHeader title={`Modifier ${app.name}`} />
      <AppForm app={app} action={updateAppAction.bind(null, id)} />
    </PageContainer>
  );
}
