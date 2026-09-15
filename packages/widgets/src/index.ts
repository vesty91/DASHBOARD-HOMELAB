export type { AppTileConfig, AppTileData, AppTileDraftConfig, AppTileView } from "./app-tile";
export {
  APP_TILE_UNSET_APP_ID,
  appTileConfigSchema,
  appTileContract,
  appTileDefaultConfig,
  appTileDraftConfig,
} from "./app-tile";
export type { BookmarkLink, BookmarksConfig } from "./bookmarks";
export {
  bookmarkLinkSchema,
  bookmarksConfigSchema,
  bookmarksContract,
  bookmarksDefaultConfig,
} from "./bookmarks";
export { builtInWidgetRegistry, createBuiltInWidgetRegistry } from "./built-in";
export type {
  CustomApiValueConfig,
  CustomApiValueDraftConfig,
  CustomApiValueView,
} from "./custom-api-value";
export {
  CUSTOM_API_VALUE_UNSET_INTEGRATION_ID,
  customApiValueConfigSchema,
  customApiValueContract,
  customApiValueDefaultConfig,
  customApiValueDraftConfig,
} from "./custom-api-value";
export type { ClockConfig } from "./clock";
export {
  clockConfigSchema,
  clockContract,
  clockDefaultConfig,
  formatClock,
  isValidTimeZone,
} from "./clock";
export { resolveWidgetConfig, serializeWidgetConfig, statusToRuntime } from "./config";
export { assertWidgetContract } from "./definition";
export { createWidgetPolicy } from "./policy";
export { createWidgetRegistry, WidgetRegistry } from "./registry";
export type {
  WidgetCatalogEntry,
  WidgetConfigMigration,
  WidgetContract,
  WidgetEnginePolicy,
  WidgetItemStatus,
  WidgetResolveResult,
  WidgetRuntimeState,
  WidgetSize,
  WidgetSizing,
} from "./types";
export { parseHttpUrl } from "./urls";
export type {
  GrafanaStatusConfig,
  GrafanaStatusDraftConfig,
  GrafanaStatusView,
} from "./grafana-status";
export {
  GRAFANA_STATUS_UNSET_INTEGRATION_ID,
  grafanaStatusConfigSchema,
  grafanaStatusContract,
  grafanaStatusDefaultConfig,
  grafanaStatusDraftConfig,
} from "./grafana-status";
export type { NtfyStatusConfig, NtfyStatusDraftConfig, NtfyStatusView } from "./ntfy-status";
export {
  NTFY_STATUS_UNSET_INTEGRATION_ID,
  ntfyStatusConfigSchema,
  ntfyStatusContract,
  ntfyStatusDefaultConfig,
  ntfyStatusDraftConfig,
} from "./ntfy-status";
export type {
  ProwlarrStatusConfig,
  ProwlarrStatusDraftConfig,
  ProwlarrStatusView,
} from "./prowlarr-status";
export {
  PROWLARR_STATUS_UNSET_INTEGRATION_ID,
  prowlarrStatusConfigSchema,
  prowlarrStatusContract,
  prowlarrStatusDefaultConfig,
  prowlarrStatusDraftConfig,
} from "./prowlarr-status";
export type {
  QbittorrentTransferConfig,
  QbittorrentTransferDraftConfig,
  QbittorrentTransferView,
} from "./qbittorrent-transfer";
export {
  QBITTORRENT_TRANSFER_UNSET_INTEGRATION_ID,
  qbittorrentTransferConfigSchema,
  qbittorrentTransferContract,
  qbittorrentTransferDefaultConfig,
  qbittorrentTransferDraftConfig,
} from "./qbittorrent-transfer";
export type {
  RadarrOverviewConfig,
  RadarrOverviewDraftConfig,
  RadarrOverviewView,
} from "./radarr-overview";
export {
  RADARR_OVERVIEW_UNSET_INTEGRATION_ID,
  radarrOverviewConfigSchema,
  radarrOverviewContract,
  radarrOverviewDefaultConfig,
  radarrOverviewDraftConfig,
} from "./radarr-overview";
export type {
  SonarrOverviewConfig,
  SonarrOverviewDraftConfig,
  SonarrOverviewView,
} from "./sonarr-overview";
export {
  SONARR_OVERVIEW_UNSET_INTEGRATION_ID,
  sonarrOverviewConfigSchema,
  sonarrOverviewContract,
  sonarrOverviewDefaultConfig,
  sonarrOverviewDraftConfig,
} from "./sonarr-overview";
export type { BeszelHostsConfig, BeszelHostsDraftConfig, BeszelHostsView } from "./beszel-hosts";
export {
  BESZEL_HOSTS_UNSET_INTEGRATION_ID,
  beszelHostsConfigSchema,
  beszelHostsContract,
  beszelHostsDefaultConfig,
  beszelHostsDraftConfig,
} from "./beszel-hosts";
export type { ImmichStatsConfig, ImmichStatsDraftConfig, ImmichStatsView } from "./immich-stats";
export {
  IMMICH_STATS_UNSET_INTEGRATION_ID,
  immichStatsConfigSchema,
  immichStatsContract,
  immichStatsDefaultConfig,
  immichStatsDraftConfig,
} from "./immich-stats";
export type {
  JellyfinPlaybackMode,
  JellyfinSessionViewItem,
  JellyfinSessionsConfig,
  JellyfinSessionsDraftConfig,
  JellyfinSessionsView,
} from "./jellyfin-sessions";
export {
  JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID,
  jellyfinSessionsConfigSchema,
  jellyfinSessionsContract,
  jellyfinSessionsDefaultConfig,
  jellyfinSessionsDraftConfig,
} from "./jellyfin-sessions";
export type {
  PrometheusMetricConfig,
  PrometheusMetricDraftConfig,
  PrometheusMetricView,
} from "./prometheus-metric";
export type {
  ProxmoxResourcesConfig,
  ProxmoxResourcesDraftConfig,
  ProxmoxResourcesView,
} from "./proxmox-resources";
export {
  PROXMOX_RESOURCES_UNSET_INTEGRATION_ID,
  proxmoxResourcesConfigSchema,
  proxmoxResourcesContract,
  proxmoxResourcesDefaultConfig,
  proxmoxResourcesDraftConfig,
} from "./proxmox-resources";
export {
  PROMETHEUS_METRIC_UNSET_INTEGRATION_ID,
  prometheusMetricConfigSchema,
  prometheusMetricContract,
  prometheusMetricDefaultConfig,
  prometheusMetricDraftConfig,
} from "./prometheus-metric";
export type {
  SeerrRequestsConfig,
  SeerrRequestsDraftConfig,
  SeerrRequestsView,
} from "./seerr-requests";
export {
  SEERR_REQUESTS_UNSET_INTEGRATION_ID,
  seerrRequestsConfigSchema,
  seerrRequestsContract,
  seerrRequestsDefaultConfig,
  seerrRequestsDraftConfig,
} from "./seerr-requests";
export type {
  ServiceStatusCanonical,
  ServiceStatusConfig,
  ServiceStatusDisplayMode,
  ServiceStatusDraftConfig,
  ServiceStatusItemView,
  ServiceStatusSourceType,
  ServiceStatusView,
} from "./service-status";
export {
  SERVICE_STATUS_DEFAULT_MAX_ITEMS,
  SERVICE_STATUS_DISPLAY_MODES,
  SERVICE_STATUS_ID_PATTERN,
  SERVICE_STATUS_MAX_ITEMS,
  SERVICE_STATUS_SOURCE_TYPES,
  pruneServiceStatusSelectedIds,
  serviceStatusConfigSchema,
  serviceStatusContract,
  serviceStatusDefaultConfig,
  serviceStatusDraftConfig,
  sourceTypeFromServiceStatusId,
} from "./service-status";
export type {
  UptimeKumaStatusConfig,
  UptimeKumaStatusDraftConfig,
  UptimeKumaStatusView,
} from "./uptime-kuma-status";
export {
  UPTIME_KUMA_STATUS_UNSET_INTEGRATION_ID,
  uptimeKumaStatusConfigSchema,
  uptimeKumaStatusContract,
  uptimeKumaStatusDefaultConfig,
  uptimeKumaStatusDraftConfig,
} from "./uptime-kuma-status";

import { builtInWidgetRegistry } from "./built-in";
import { createWidgetPolicy } from "./policy";

export function createBuiltInWidgetPolicy() {
  return createWidgetPolicy(builtInWidgetRegistry);
}
