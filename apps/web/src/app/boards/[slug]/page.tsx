import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";
import { Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "../../../lib/server/board-api";
import { resolveAppTileViews } from "../resolve-app-tiles";
import { resolveBeszelHostsViews } from "../resolve-beszel-hosts";
import { resolveImmichStatsViews } from "../resolve-immich-stats";
import { resolveJellyfinSessionViews } from "../resolve-jellyfin-sessions";
import { resolvePrometheusMetricViews } from "../resolve-prometheus-metric";
import { resolveServiceStatusViews } from "../resolve-service-status";
import { resolveUptimeKumaStatusViews } from "../resolve-uptime-kuma-status";
import { resolveGrafanaStatusViews } from "../resolve-grafana-status";
import { resolveNtfyStatusViews } from "../resolve-ntfy-status";
import { resolveProwlarrStatusViews } from "../resolve-prowlarr-status";
import { resolveQbittorrentTransferViews } from "../resolve-qbittorrent-transfer";
import { resolveSeerrRequestsViews } from "../resolve-seerr-requests";
import { resolveCustomApiValueViews } from "../resolve-custom-api-value";
import { resolveRadarrOverviewViews } from "../resolve-radarr-overview";
import { resolveSonarrOverviewViews } from "../resolve-sonarr-overview";
import { resolveProxmoxResourcesViews } from "../resolve-proxmox-resources";
import { ResponsiveBoardReadGrid } from "../responsive-board-read-grid";

const visibilityLabel = {
  private: "Privé",
  authenticated: "Authentifié",
  public: "Public",
} as const;

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const caller = await getBoardCaller();
  let snapshot;
  try {
    snapshot = await caller.board.get({ slug });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect(`/login?callbackUrl=/boards/${slug}`);
    if (error instanceof TRPCError && error.code === "FORBIDDEN") redirect("/forbidden");
    throw error;
  }
  const [
    canEdit,
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
  ] = await Promise.all([
    caller.board.canAccess({ slug, permission: "board.edit" }),
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
  ]);
  return (
    <PageContainer wide>
      <PageHeader
        title={snapshot.board.name}
        {...(snapshot.board.description ? { description: snapshot.board.description } : {})}
        actions={
          <>
            <Badge>{visibilityLabel[snapshot.board.visibility]}</Badge>
            {canEdit ? (
              <Link className="ui-btn ui-btn-primary" href={`/boards/${slug}/edit`}>
                Modifier
              </Link>
            ) : null}
          </>
        }
      />
      <ResponsiveBoardReadGrid
        snapshot={snapshot}
        appViews={appViews}
        jellyfinViews={jellyfinViews}
        immichViews={immichViews}
        beszelViews={beszelViews}
        prometheusViews={prometheusViews}
        uptimeKumaViews={uptimeKumaViews}
        proxmoxViews={proxmoxViews}
        grafanaViews={grafanaViews}
        ntfyViews={ntfyViews}
        prowlarrViews={prowlarrViews}
        qbittorrentViews={qbittorrentViews}
        seerrViews={seerrViews}
        customApiViews={customApiViews}
        radarrViews={radarrViews}
        sonarrViews={sonarrViews}
        serviceStatusViews={serviceStatusViews}
      />
    </PageContainer>
  );
}
