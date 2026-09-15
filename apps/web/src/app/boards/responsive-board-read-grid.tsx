"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import type {
  AppTileView,
  BeszelHostsView,
  ImmichStatsView,
  JellyfinSessionsView,
  PrometheusMetricView,
  ServiceStatusView,
  UptimeKumaStatusView,
  GrafanaStatusView,
  NtfyStatusView,
  ProwlarrStatusView,
  QbittorrentTransferView,
  SeerrRequestsView,
  CustomApiValueView,
  RadarrOverviewView,
  SonarrOverviewView,
  ProxmoxResourcesView,
} from "@dashboard/widgets";
import { BoardReadGrid } from "./board-read-grid";
import { JELLYFIN_BOARD_REFRESH_MS, shouldPollJellyfinBoard } from "./jellyfin-board-refresh";
import { collectLiveIntegrationIds } from "./live-integration-ids";
import { useBoardLiveRefresh } from "./use-board-live-refresh";

const MOBILE_QUERY = "(max-width: 767px)";
export function ResponsiveBoardReadGrid({
  snapshot,
  appViews,
  jellyfinViews = {},
  immichViews = {},
  beszelViews = {},
  prometheusViews = {},
  uptimeKumaViews = {},
  proxmoxViews = {},
  grafanaViews = {},
  ntfyViews = {},
  prowlarrViews = {},
  qbittorrentViews = {},
  seerrViews = {},
  customApiViews = {},
  radarrViews = {},
  sonarrViews = {},
  serviceStatusViews = {},
}: {
  snapshot: BoardSnapshot;
  appViews: Record<string, AppTileView>;
  jellyfinViews?: Record<string, JellyfinSessionsView>;
  immichViews?: Record<string, ImmichStatsView>;
  beszelViews?: Record<string, BeszelHostsView>;
  prometheusViews?: Record<string, PrometheusMetricView>;
  uptimeKumaViews?: Record<string, UptimeKumaStatusView>;
  proxmoxViews?: Record<string, ProxmoxResourcesView>;
  grafanaViews?: Record<string, GrafanaStatusView>;
  ntfyViews?: Record<string, NtfyStatusView>;
  prowlarrViews?: Record<string, ProwlarrStatusView>;
  qbittorrentViews?: Record<string, QbittorrentTransferView>;
  seerrViews?: Record<string, SeerrRequestsView>;
  customApiViews?: Record<string, CustomApiValueView>;
  radarrViews?: Record<string, RadarrOverviewView>;
  sonarrViews?: Record<string, SonarrOverviewView>;
  serviceStatusViews?: Record<string, ServiceStatusView>;
}) {
  const router = useRouter();
  const [requested, setRequested] = useState<"desktop" | "mobile">("desktop");
  const pollBoard =
    shouldPollJellyfinBoard(jellyfinViews) ||
    shouldPollJellyfinBoard(immichViews) ||
    shouldPollJellyfinBoard(beszelViews) ||
    shouldPollJellyfinBoard(prometheusViews) ||
    shouldPollJellyfinBoard(uptimeKumaViews) ||
    shouldPollJellyfinBoard(proxmoxViews) ||
    shouldPollJellyfinBoard(grafanaViews) ||
    shouldPollJellyfinBoard(ntfyViews) ||
    shouldPollJellyfinBoard(prowlarrViews) ||
    shouldPollJellyfinBoard(qbittorrentViews) ||
    shouldPollJellyfinBoard(seerrViews) ||
    shouldPollJellyfinBoard(customApiViews) ||
    shouldPollJellyfinBoard(radarrViews) ||
    shouldPollJellyfinBoard(sonarrViews) ||
    shouldPollJellyfinBoard(serviceStatusViews);
  useBoardLiveRefresh({
    boardId: snapshot.board.id,
    integrationIds: collectLiveIntegrationIds(snapshot.items, serviceStatusViews),
    onRefresh: () => {
      router.refresh();
    },
  });
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setRequested(media.matches ? "mobile" : "desktop");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!pollBoard) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, JELLYFIN_BOARD_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [pollBoard, router]);
  const layout =
    snapshot.layouts.find((entry) => entry.breakpoint === requested) ??
    snapshot.layouts.find((entry) => entry.breakpoint !== requested) ??
    snapshot.layouts[0];
  if (!layout) return <p>Aucun layout disponible.</p>;
  return (
    <BoardReadGrid
      layout={layout}
      items={snapshot.items}
      placements={snapshot.placements.filter((entry) => entry.layoutId === layout.id)}
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
  );
}
