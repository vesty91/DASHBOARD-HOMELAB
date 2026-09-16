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
import { resolveReliabilityStatusViews } from "../../resolve-reliability-status";
import { resolveServiceStatusViews } from "../../resolve-service-status";
import { resolveUptimeKumaStatusViews } from "../../resolve-uptime-kuma-status";
import { resolveGrafanaStatusViews } from "../../resolve-grafana-status";
import { resolveNtfyStatusViews } from "../../resolve-ntfy-status";
import { resolveProwlarrStatusViews } from "../../resolve-prowlarr-status";
import { resolveQbittorrentTransferViews } from "../../resolve-qbittorrent-transfer";
import { resolveSeerrRequestsViews } from "../../resolve-seerr-requests";
import { resolveCustomApiValueViews } from "../../resolve-custom-api-value";
import { resolveRadarrOverviewViews } from "../../resolve-radarr-overview";
import { resolveSonarrOverviewViews } from "../../resolve-sonarr-overview";
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
    grafanaViews,
    ntfyViews,
    prowlarrViews,
    qbittorrentViews,
    seerrViews,
    customApiViews,
    radarrViews,
    sonarrViews,
    serviceStatusViews,
    reliabilityStatusViews,
  ] = await Promise.all([
    resolveAppTileViews(snapshot, caller),
    resolveJellyfinSessionViews(snapshot, caller),
    resolveImmichStatsViews(snapshot, caller),
    resolveBeszelHostsViews(snapshot, caller),
    resolvePrometheusMetricViews(snapshot, caller),
    resolveUptimeKumaStatusViews(snapshot, caller),
    resolveProxmoxResourcesViews(snapshot, caller),
    resolveGrafanaStatusViews(snapshot, caller),
    resolveNtfyStatusViews(snapshot, caller),
    resolveProwlarrStatusViews(snapshot, caller),
    resolveQbittorrentTransferViews(snapshot, caller),
    resolveSeerrRequestsViews(snapshot, caller),
    resolveCustomApiValueViews(snapshot, caller),
    resolveRadarrOverviewViews(snapshot, caller),
    resolveSonarrOverviewViews(snapshot, caller),
    resolveServiceStatusViews(snapshot, caller),
    resolveReliabilityStatusViews(snapshot, caller),
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
  let grafanaIntegrations: Awaited<ReturnType<typeof caller.grafana.integration.list>> = [];
  try {
    grafanaIntegrations = await caller.grafana.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let ntfyIntegrations: Awaited<ReturnType<typeof caller.ntfy.integration.list>> = [];
  try {
    ntfyIntegrations = await caller.ntfy.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let prowlarrIntegrations: Awaited<ReturnType<typeof caller.prowlarr.integration.list>> = [];
  try {
    prowlarrIntegrations = await caller.prowlarr.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let qbittorrentIntegrations: Awaited<ReturnType<typeof caller.qbittorrent.integration.list>> = [];
  try {
    qbittorrentIntegrations = await caller.qbittorrent.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let seerrIntegrations: Awaited<ReturnType<typeof caller.seerr.integration.list>> = [];
  try {
    seerrIntegrations = await caller.seerr.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let customApiIntegrations: Awaited<ReturnType<typeof caller.customApi.integration.list>> = [];
  try {
    customApiIntegrations = await caller.customApi.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let radarrIntegrations: Awaited<ReturnType<typeof caller.radarr.integration.list>> = [];
  try {
    radarrIntegrations = await caller.radarr.integration.list();
  } catch (error) {
    if (!(
      error instanceof TRPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ))
      throw error;
  }
  let sonarrIntegrations: Awaited<ReturnType<typeof caller.sonarr.integration.list>> = [];
  try {
    sonarrIntegrations = await caller.sonarr.integration.list();
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
  let reliabilityIntegrations: Awaited<ReturnType<typeof caller.integration.list>>["items"] = [];
  try {
    reliabilityIntegrations = (await caller.integration.list({ limit: 100 })).items;
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
        grafanaViews={grafanaViews}
        grafanaIntegrations={grafanaIntegrations}
        ntfyViews={ntfyViews}
        ntfyIntegrations={ntfyIntegrations}
        prowlarrViews={prowlarrViews}
        prowlarrIntegrations={prowlarrIntegrations}
        qbittorrentViews={qbittorrentViews}
        qbittorrentIntegrations={qbittorrentIntegrations}
        seerrViews={seerrViews}
        seerrIntegrations={seerrIntegrations}
        customApiViews={customApiViews}
        customApiIntegrations={customApiIntegrations}
        radarrViews={radarrViews}
        radarrIntegrations={radarrIntegrations}
        sonarrViews={sonarrViews}
        sonarrIntegrations={sonarrIntegrations}
        serviceStatusViews={serviceStatusViews}
        reliabilityStatusViews={reliabilityStatusViews}
        serviceStatusCatalog={serviceStatusCatalog}
        reliabilityIntegrations={reliabilityIntegrations}
        canReadApps={canReadApps}
      />
    </PageContainer>
  );
}
