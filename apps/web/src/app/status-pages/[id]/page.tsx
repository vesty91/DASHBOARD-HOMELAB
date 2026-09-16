import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { StatusPageDetail } from "./status-page-detail";

export const dynamic = "force-dynamic";

export default async function StatusPageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await getBoardCaller();
  const permissions = await caller.statusPage.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  let page;
  try {
    page = await caller.statusPage.get({ id });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [integrations, maintenances] = await Promise.all([
    caller.integration.list({ limit: 100 }).catch(() => ({
      items: [] as Array<{ id: string; name: string; type: string }>,
    })),
    permissions.canRead ? caller.statusPage.listMaintenance().catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <PageContainer wide>
      <PageHeader
        title={page.name}
        description={
          page.description ?? "Configurer les services, la publication et la maintenance."
        }
      />
      <StatusPageDetail
        page={page}
        integrations={integrations.items.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
        }))}
        maintenances={maintenances}
        canManage={permissions.canManage}
      />
    </PageContainer>
  );
}
