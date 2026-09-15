"use client";
import type { AppTileConfig, AppTileView } from "../app-tile";
import type { BookmarksConfig } from "../bookmarks";
import type { ClockConfig } from "../clock";
import type { BeszelHostsView } from "../beszel-hosts";
import type { ImmichStatsView } from "../immich-stats";
import type { JellyfinSessionsView } from "../jellyfin-sessions";
import type { PrometheusMetricView } from "../prometheus-metric";
import type { GrafanaStatusView } from "../grafana-status";
import type { NtfyStatusView } from "../ntfy-status";
import type { ProxmoxResourcesView } from "../proxmox-resources";
import type { ProwlarrStatusView } from "../prowlarr-status";
import type { QbittorrentTransferView } from "../qbittorrent-transfer";
import type { RadarrOverviewView } from "../radarr-overview";
import type { SonarrOverviewView } from "../sonarr-overview";
import type { ServiceStatusView } from "../service-status";
import type { UptimeKumaStatusView } from "../uptime-kuma-status";
import { builtInWidgetRegistry } from "../built-in";
import { serializeWidgetConfig } from "../config";
import type { WidgetItemStatus } from "../types";
import { AppTileWidget } from "./app-tile-widget";
import { BookmarksWidget } from "./bookmarks-widget";
import { ClockWidget } from "./clock-widget";
import { BeszelHostsWidget } from "./beszel-hosts-widget";
import { ImmichStatsWidget } from "./immich-stats-widget";
import { JellyfinSessionsWidget } from "./jellyfin-sessions-widget";
import { PrometheusMetricWidget } from "./prometheus-metric-widget";
import { GrafanaStatusWidget } from "./grafana-status-widget";
import { NtfyStatusWidget } from "./ntfy-status-widget";
import { ProxmoxResourcesWidget } from "./proxmox-resources-widget";
import { ProwlarrStatusWidget } from "./prowlarr-status-widget";
import { QbittorrentTransferWidget } from "./qbittorrent-transfer-widget";
import { RadarrOverviewWidget } from "./radarr-overview-widget";
import { SonarrOverviewWidget } from "./sonarr-overview-widget";
import { ServiceStatusWidget } from "./service-status-widget";
import { UptimeKumaStatusWidget } from "./uptime-kuma-status-widget";
import { WidgetBoundary } from "./widget-boundary";
import { WidgetFrame } from "./widget-frame";

export interface WidgetItemView {
  id: string;
  widgetType: string;
  widgetVersion: number;
  title: string | null;
  config: unknown | null;
  runtimeStatus: WidgetItemStatus;
}

function titleOf(item: WidgetItemView): string {
  if (item.title?.trim()) return item.title;
  return builtInWidgetRegistry.get(item.widgetType)?.name ?? item.widgetType;
}

function frameForStatus(item: WidgetItemView) {
  const title = titleOf(item);
  switch (item.runtimeStatus) {
    case "ready":
      return null;
    case "unknown":
      return <WidgetFrame title={title} state="error" message="Widget inconnu" />;
    case "incompatible-version":
      return <WidgetFrame title={title} state="error" message="Version de widget incompatible" />;
    case "invalid-config":
    case "configuration-missing":
      return <WidgetFrame title={title} state="configuration-missing" />;
    default: {
      const exhaustive: never = item.runtimeStatus;
      return exhaustive;
    }
  }
}

function ReadyWidget({
  item,
  appView,
  jellyfinView,
  immichView,
  beszelView,
  prometheusView,
  grafanaView,
  ntfyView,
  prowlarrView,
  qbittorrentView,
  radarrView,
  sonarrView,
  proxmoxView,
  serviceStatusView,
  uptimeKumaView,
}: {
  item: WidgetItemView;
  appView: AppTileView | undefined;
  jellyfinView: JellyfinSessionsView | undefined;
  immichView: ImmichStatsView | undefined;
  beszelView: BeszelHostsView | undefined;
  prometheusView: PrometheusMetricView | undefined;
  grafanaView: GrafanaStatusView | undefined;
  ntfyView: NtfyStatusView | undefined;
  prowlarrView: ProwlarrStatusView | undefined;
  qbittorrentView: QbittorrentTransferView | undefined;
  radarrView: RadarrOverviewView | undefined;
  sonarrView: SonarrOverviewView | undefined;
  proxmoxView: ProxmoxResourcesView | undefined;
  serviceStatusView: ServiceStatusView | undefined;
  uptimeKumaView: UptimeKumaStatusView | undefined;
}) {
  switch (item.widgetType) {
    case "clock":
      return <ClockWidget config={item.config as ClockConfig} />;
    case "bookmarks":
      return <BookmarksWidget config={item.config as BookmarksConfig} />;
    case "app-tile":
      return <AppTileWidget config={item.config as AppTileConfig} view={appView} />;
    case "jellyfin-sessions":
      return <JellyfinSessionsWidget view={jellyfinView} />;
    case "immich-stats":
      return <ImmichStatsWidget view={immichView} />;
    case "beszel-hosts":
      return <BeszelHostsWidget view={beszelView} />;
    case "prometheus-metric":
      return <PrometheusMetricWidget view={prometheusView} />;
    case "grafana-status":
      return <GrafanaStatusWidget view={grafanaView} />;
    case "ntfy-status":
      return <NtfyStatusWidget view={ntfyView} />;
    case "prowlarr-status":
      return <ProwlarrStatusWidget view={prowlarrView} />;
    case "qbittorrent-transfer":
      return <QbittorrentTransferWidget view={qbittorrentView} />;
    case "radarr-overview":
      return <RadarrOverviewWidget view={radarrView} />;
    case "sonarr-overview":
      return <SonarrOverviewWidget view={sonarrView} />;
    case "proxmox-resources":
      return <ProxmoxResourcesWidget view={proxmoxView} />;
    case "service-status":
      return <ServiceStatusWidget view={serviceStatusView} />;
    case "uptime-kuma-status":
      return <UptimeKumaStatusWidget view={uptimeKumaView} />;
    default:
      return null;
  }
}

export function WidgetRenderer({
  item,
  appView,
  jellyfinView,
  immichView,
  beszelView,
  prometheusView,
  grafanaView,
  ntfyView,
  prowlarrView,
  qbittorrentView,
  radarrView,
  sonarrView,
  proxmoxView,
  serviceStatusView,
  uptimeKumaView,
}: {
  item: WidgetItemView;
  appView?: AppTileView;
  jellyfinView?: JellyfinSessionsView;
  immichView?: ImmichStatsView;
  beszelView?: BeszelHostsView;
  prometheusView?: PrometheusMetricView;
  grafanaView?: GrafanaStatusView;
  ntfyView?: NtfyStatusView;
  prowlarrView?: ProwlarrStatusView;
  qbittorrentView?: QbittorrentTransferView;
  radarrView?: RadarrOverviewView;
  sonarrView?: SonarrOverviewView;
  proxmoxView?: ProxmoxResourcesView;
  serviceStatusView?: ServiceStatusView;
  uptimeKumaView?: UptimeKumaStatusView;
}) {
  const blocked = frameForStatus(item);
  if (blocked) return blocked;
  return (
    <WidgetBoundary
      resetKey={`${item.id}:${item.widgetVersion}:${serializeWidgetConfig(item.config)}`}
    >
      <WidgetFrame title={titleOf(item)} state="ready">
        <ReadyWidget
          item={item}
          appView={appView}
          jellyfinView={jellyfinView}
          immichView={immichView}
          beszelView={beszelView}
          prometheusView={prometheusView}
          grafanaView={grafanaView}
          ntfyView={ntfyView}
          prowlarrView={prowlarrView}
          qbittorrentView={qbittorrentView}
          radarrView={radarrView}
          sonarrView={sonarrView}
          proxmoxView={proxmoxView}
          serviceStatusView={serviceStatusView}
          uptimeKumaView={uptimeKumaView}
        />
      </WidgetFrame>
    </WidgetBoundary>
  );
}
