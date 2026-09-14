import Link from "next/link";
import { PageContainer } from "@dashboard/ui";
import { getBoardCaller } from "../../../../lib/server/board-api";
import { BoardEditWorkspace } from "../../board-edit-workspace";
import { deleteBoardAction } from "../../actions";
import { DeleteBoardControl } from "../../delete-board-control";
import { resolveAppTileViews } from "../../resolve-app-tiles";
import { resolveBeszelHostsViews } from "../../resolve-beszel-hosts";
import { resolveImmichStatsViews } from "../../resolve-immich-stats";
import { resolveJellyfinSessionViews } from "../../resolve-jellyfin-sessions";
import { resolvePrometheusMetricViews } from "../../resolve-prometheus-metric";
import { resolveServiceStatusViews } from "../../resolve-service-status";
import { resolveUptimeKumaStatusViews } from "../../resolve-uptime-kuma-status";
import { resolveProxmoxResourcesViews } from "../../resolve-proxmox-resources";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";

export default async function EditBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const caller = await getBoardCaller();
  let snapshot;
  try {
    snapshot = await caller.board.getForEdit({ slug });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect(`/login?callbackUrl=/boards/${slug}/edit`);
    if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      redirect("/forbidden");
    throw error;
  }
  const catalog = await caller.widget.catalog();
  const [
    appViews,
    jellyfinViews,
    immichViews,
    beszelViews,
    prometheusViews,
    uptimeKumaViews,
    proxmoxViews,
    serviceStatusViews,
  ] = await Promise.all([
    resolveAppTileViews(snapshot, caller),
    resolveJellyfinSessionViews(snapshot, caller),
    resolveImmichStatsViews(snapshot, caller),
    resolveBeszelHostsViews(snapshot, caller),
    resolvePrometheusMetricViews(snapshot, caller),
    resolveUptimeKumaStatusViews(snapshot, caller),
    resolveProxmoxResourcesViews(snapshot, caller),
    resolveServiceStatusViews(snapshot, caller),
  ]);
  let canReadApps = true;
  try {
    await caller.app.list({ limit: 1 });
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED"))
      canReadApps = false;
    else throw error;
  }
  let jellyfinIntegrations: Awaited<ReturnType<typeof caller.jellyfin.integration.list>> = [];
  try {
    jellyfinIntegrations = await caller.jellyfin.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let immichIntegrations: Awaited<ReturnType<typeof caller.immich.integration.list>> = [];
  try {
    immichIntegrations = await caller.immich.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let beszelIntegrations: Awaited<ReturnType<typeof caller.beszel.integration.list>> = [];
  try {
    beszelIntegrations = await caller.beszel.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let prometheusIntegrations: Awaited<ReturnType<typeof caller.prometheus.integration.list>> = [];
  try {
    prometheusIntegrations = await caller.prometheus.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let uptimeKumaIntegrations: Awaited<ReturnType<typeof caller.uptimeKuma.integration.list>> = [];
  try {
    uptimeKumaIntegrations = await caller.uptimeKuma.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let proxmoxIntegrations: Awaited<ReturnType<typeof caller.proxmox.integration.list>> = [];
  try {
    proxmoxIntegrations = await caller.proxmox.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let serviceStatusCatalog: Awaited<ReturnType<typeof caller.serviceStatus.catalog>>["items"] = [];
  try {
    serviceStatusCatalog = (await caller.serviceStatus.catalog({})).items;
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  return (
    <PageContainer wide>
      <header className="board-edit-chrome">
        <Link className="ui-btn ui-btn-ghost" href={`/boards/${slug}`}>
          Retour
        </Link>
        <h1 className="ui-page-title" style={{ fontSize: "1.35rem", margin: 0 }}>
          Modifier {snapshot.board.name}
        </h1>
        <DeleteBoardControl action={deleteBoardAction.bind(null, snapshot.board.id)} />
      </header>
      <BoardEditWorkspace
        snapshot={snapshot}
        catalog={catalog}
        appViews={appViews}
        jellyfinViews={jellyfinViews}
        jellyfinIntegrations={jellyfinIntegrations}
        immichViews={immichViews}
        immichIntegrations={immichIntegrations}
        beszelViews={beszelViews}
        beszelIntegrations={beszelIntegrations}
        prometheusViews={prometheusViews}
        prometheusIntegrations={prometheusIntegrations}
        uptimeKumaViews={uptimeKumaViews}
        uptimeKumaIntegrations={uptimeKumaIntegrations}
        proxmoxViews={proxmoxViews}
        proxmoxIntegrations={proxmoxIntegrations}
        serviceStatusViews={serviceStatusViews}
        serviceStatusCatalog={serviceStatusCatalog}
        canReadApps={canReadApps}
      />
    </PageContainer>
  );
}
