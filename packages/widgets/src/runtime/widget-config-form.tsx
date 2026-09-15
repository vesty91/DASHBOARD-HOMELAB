"use client";
import type { AppTileDraftConfig } from "../app-tile";
import type { ClockConfig } from "../clock";
import type { BeszelHostsDraftConfig } from "../beszel-hosts";
import type { ImmichStatsDraftConfig } from "../immich-stats";
import type { JellyfinSessionsDraftConfig } from "../jellyfin-sessions";
import type { PrometheusMetricDraftConfig } from "../prometheus-metric";
import type { GrafanaStatusDraftConfig } from "../grafana-status";
import type { NtfyStatusDraftConfig } from "../ntfy-status";
import type { ProxmoxResourcesDraftConfig } from "../proxmox-resources";
import type { ProwlarrStatusDraftConfig } from "../prowlarr-status";
import type { RadarrOverviewDraftConfig } from "../radarr-overview";
import type { SonarrOverviewDraftConfig } from "../sonarr-overview";
import type { ServiceStatusDraftConfig } from "../service-status";
import type { UptimeKumaStatusDraftConfig } from "../uptime-kuma-status";
import { AppTileForm, type AppOption } from "./app-tile-form";
import { BeszelHostsForm, type BeszelIntegrationOption } from "./beszel-hosts-form";
import { BookmarksForm, type BookmarksDraftConfig } from "./bookmarks-form";
import { ClockForm } from "./clock-form";
import { ImmichStatsForm, type ImmichIntegrationOption } from "./immich-stats-form";
import { JellyfinSessionsForm, type JellyfinIntegrationOption } from "./jellyfin-sessions-form";
import { PrometheusMetricForm, type PrometheusIntegrationOption } from "./prometheus-metric-form";
import { GrafanaStatusForm, type GrafanaIntegrationOption } from "./grafana-status-form";
import { NtfyStatusForm, type NtfyIntegrationOption } from "./ntfy-status-form";
import { ProxmoxResourcesForm, type ProxmoxIntegrationOption } from "./proxmox-resources-form";
import { ProwlarrStatusForm, type ProwlarrIntegrationOption } from "./prowlarr-status-form";
import { RadarrOverviewForm, type RadarrIntegrationOption } from "./radarr-overview-form";
import { SonarrOverviewForm, type SonarrIntegrationOption } from "./sonarr-overview-form";
import { ServiceStatusForm, type ServiceStatusCatalogOption } from "./service-status-form";
import { UptimeKumaStatusForm, type UptimeKumaIntegrationOption } from "./uptime-kuma-status-form";

export function WidgetConfigForm({
  widgetType,
  config,
  onChange,
  permissionDenied,
  loadApps,
  jellyfinIntegrations,
  immichIntegrations,
  beszelIntegrations,
  prometheusIntegrations,
  grafanaIntegrations,
  ntfyIntegrations,
  prowlarrIntegrations,
  radarrIntegrations,
  sonarrIntegrations,
  proxmoxIntegrations,
  serviceStatusCatalog,
  uptimeKumaIntegrations,
}: {
  widgetType: string;
  config: unknown;
  onChange: (config: unknown) => void;
  permissionDenied?: boolean;
  loadApps?: (cursor?: string) => Promise<{ items: AppOption[]; nextCursor: string | null }>;
  jellyfinIntegrations?: readonly JellyfinIntegrationOption[];
  immichIntegrations?: readonly ImmichIntegrationOption[];
  beszelIntegrations?: readonly BeszelIntegrationOption[];
  prometheusIntegrations?: readonly PrometheusIntegrationOption[];
  grafanaIntegrations?: readonly GrafanaIntegrationOption[];
  ntfyIntegrations?: readonly NtfyIntegrationOption[];
  prowlarrIntegrations?: readonly ProwlarrIntegrationOption[];
  radarrIntegrations?: readonly RadarrIntegrationOption[];
  sonarrIntegrations?: readonly SonarrIntegrationOption[];
  proxmoxIntegrations?: readonly ProxmoxIntegrationOption[];
  serviceStatusCatalog?: readonly ServiceStatusCatalogOption[];
  uptimeKumaIntegrations?: readonly UptimeKumaIntegrationOption[];
}) {
  switch (widgetType) {
    case "clock":
      return <ClockForm config={config as ClockConfig} onChange={onChange} />;
    case "bookmarks":
      return <BookmarksForm config={config as BookmarksDraftConfig} onChange={onChange} />;
    case "app-tile":
      if (!loadApps) return <p role="status">Permission insuffisante</p>;
      return (
        <AppTileForm
          config={config as AppTileDraftConfig}
          onChange={onChange}
          {...(permissionDenied ? { permissionDenied: true } : {})}
          loadApps={loadApps}
        />
      );
    case "jellyfin-sessions":
      return (
        <JellyfinSessionsForm
          config={config as JellyfinSessionsDraftConfig}
          onChange={onChange}
          integrations={jellyfinIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "immich-stats":
      return (
        <ImmichStatsForm
          config={config as ImmichStatsDraftConfig}
          onChange={onChange}
          integrations={immichIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "beszel-hosts":
      return (
        <BeszelHostsForm
          config={config as BeszelHostsDraftConfig}
          onChange={onChange}
          integrations={beszelIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "prometheus-metric":
      return (
        <PrometheusMetricForm
          config={config as PrometheusMetricDraftConfig}
          onChange={onChange}
          integrations={prometheusIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "grafana-status":
      return (
        <GrafanaStatusForm
          config={config as GrafanaStatusDraftConfig}
          onChange={onChange}
          integrations={grafanaIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "ntfy-status":
      return (
        <NtfyStatusForm
          config={config as NtfyStatusDraftConfig}
          onChange={onChange}
          integrations={ntfyIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "prowlarr-status":
      return (
        <ProwlarrStatusForm
          config={config as ProwlarrStatusDraftConfig}
          onChange={onChange}
          integrations={prowlarrIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "radarr-overview":
      return (
        <RadarrOverviewForm
          config={config as RadarrOverviewDraftConfig}
          onChange={onChange}
          integrations={radarrIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "sonarr-overview":
      return (
        <SonarrOverviewForm
          config={config as SonarrOverviewDraftConfig}
          onChange={onChange}
          integrations={sonarrIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "proxmox-resources":
      return (
        <ProxmoxResourcesForm
          config={config as ProxmoxResourcesDraftConfig}
          onChange={onChange}
          integrations={proxmoxIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "service-status":
      return (
        <ServiceStatusForm
          config={config as ServiceStatusDraftConfig}
          onChange={onChange}
          catalog={serviceStatusCatalog ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "uptime-kuma-status":
      return (
        <UptimeKumaStatusForm
          config={config as UptimeKumaStatusDraftConfig}
          onChange={onChange}
          integrations={uptimeKumaIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    default:
      return <p role="status">Widget inconnu</p>;
  }
}
