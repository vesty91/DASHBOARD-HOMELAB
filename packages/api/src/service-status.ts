import { AppError, type AppActor, type AppDto, type AppService } from "@dashboard/apps";
import type { BeszelService } from "@dashboard/beszel";
import type { DockerService } from "@dashboard/docker";
import type { ImmichService } from "@dashboard/immich";
import { type IntegrationActor } from "@dashboard/integrations";
import type { JellyfinService } from "@dashboard/jellyfin";
import {
  appHealthDetail,
  createServiceStatusService,
  mapAppHealth,
  mapBeszelHosts,
  mapDockerContainer,
  mapImmichHealth,
  mapOverviewStatus,
  mapPrometheusUpSeries,
  mapUptimeKumaMonitors,
  type ServiceStatusActor,
  type ServiceStatusCatalogItem,
  type ServiceStatusCoalescer,
  type ServiceStatusCollector,
  type ServiceStatusItem,
  type ServiceStatusService,
} from "@dashboard/monitoring";
import { hasPermission } from "@dashboard/permissions";
import type { PrometheusService } from "@dashboard/prometheus";
import type { SynologyService } from "@dashboard/synology";
import type { UptimeKumaService } from "@dashboard/uptime-kuma";
import type { GrafanaService } from "@dashboard/grafana";
import type { NtfyService } from "@dashboard/ntfy";
import type { RadarrService } from "@dashboard/radarr";
import type { SonarrService } from "@dashboard/sonarr";
import type { ProxmoxService } from "@dashboard/proxmox";

const APP_PAGE_SIZE = 100;
const APP_MAX_PAGES = 20;

function selectedAppRecordIds(selectedIds: readonly string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const selected of selectedIds) {
    if (!selected.startsWith("app:")) continue;
    const recordId = selected.slice("app:".length);
    if (!recordId || seen.has(recordId)) continue;
    seen.add(recordId);
    found.push(recordId);
  }
  return found;
}

function asIntegrationActor(actor: ServiceStatusActor): IntegrationActor {
  return actor as IntegrationActor;
}

function asAppActor(actor: ServiceStatusActor): AppActor {
  return actor as AppActor;
}

function isoFromUnknown(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function freezeItem(item: ServiceStatusItem): ServiceStatusItem {
  return Object.freeze(item);
}

function freezeCatalog(item: ServiceStatusCatalogItem): ServiceStatusCatalogItem {
  return Object.freeze(item);
}

function dockerCatalogId(integrationId: string): string {
  return `docker:${integrationId}`;
}

function dockerContainerId(integrationId: string, containerId: string): string {
  return `docker:${integrationId}:${containerId}`;
}

async function listReadableApps(apps: AppService, actor: AppActor): Promise<AppDto[]> {
  const found: AppDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < APP_MAX_PAGES; page += 1) {
    const listed = await apps.list(actor, { limit: APP_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
    found.push(...listed.items);
    if (!listed.nextCursor) return found;
    cursor = listed.nextCursor;
  }
  return found;
}

async function resolveReadableApps(
  apps: AppService,
  actor: AppActor,
  selectedIds: readonly string[],
): Promise<AppDto[]> {
  const wanted = selectedAppRecordIds(selectedIds);
  if (wanted.length === 0) return listReadableApps(apps, actor);
  const found: AppDto[] = [];
  for (const id of wanted) {
    try {
      found.push(await apps.get(id, actor));
    } catch (error: unknown) {
      void error;
    }
  }
  return found;
}

function appCollector(apps: AppService): ServiceStatusCollector {
  return {
    sourceType: "app",
    canRead(actor) {
      const appActor = asAppActor(actor);
      return Boolean(
        appActor.userId &&
        appActor.subject &&
        appActor.subject.status === "active" &&
        hasPermission(appActor.subject, "app.read"),
      );
    },
    async listIdentities(actor, query) {
      const records = await resolveReadableApps(apps, asAppActor(actor), query.selectedIds);
      return records.map((record) =>
        freezeCatalog({ id: `app:${record.id}`, name: record.name, sourceType: "app" }),
      );
    },
    async collect(actor, query) {
      const records = await resolveReadableApps(apps, asAppActor(actor), query.selectedIds);
      return records.map((record) =>
        freezeItem({
          id: `app:${record.id}`,
          name: record.name,
          sourceType: "app",
          integrationId: record.integrationId,
          status: mapAppHealth(record.healthStatus, record.healthcheckEnabled),
          detail: appHealthDetail(record.healthStatus, record.healthcheckEnabled),
          updatedAt: isoFromUnknown(record.lastCheckedAt),
        }),
      );
    },
  };
}

function dockerCollector(docker: DockerService): ServiceStatusCollector {
  return {
    sourceType: "docker",
    canRead(actor) {
      return docker.permissions(asIntegrationActor(actor)).canRead;
    },
    async listIdentities(actor) {
      const integrations = await docker.listIntegrations(asIntegrationActor(actor));
      return integrations.map((integration) =>
        freezeCatalog({
          id: dockerCatalogId(integration.id),
          name: integration.name,
          sourceType: "docker",
        }),
      );
    },
    async collect(actor) {
      const integrationActor = asIntegrationActor(actor);
      const integrations = await docker.listIntegrations(integrationActor);
      const items: ServiceStatusItem[] = [];
      for (const integration of integrations) {
        if (!integration.enabled) {
          items.push(
            freezeItem({
              id: dockerCatalogId(integration.id),
              name: integration.name,
              sourceType: "docker",
              integrationId: integration.id,
              status: "paused",
              detail: "Intégration désactivée",
              updatedAt: null,
            }),
          );
          continue;
        }
        try {
          const containers = await docker.listContainers(
            { integrationId: integration.id, limit: 100 },
            integrationActor,
          );
          if (containers.length === 0) {
            items.push(
              freezeItem({
                id: dockerCatalogId(integration.id),
                name: integration.name,
                sourceType: "docker",
                integrationId: integration.id,
                status: "unknown",
                detail: "Aucun conteneur",
                updatedAt: null,
              }),
            );
            continue;
          }
          for (const container of containers) {
            items.push(
              freezeItem({
                id: dockerContainerId(integration.id, container.id),
                name: container.names[0] ?? container.shortId,
                sourceType: "docker",
                integrationId: integration.id,
                status: mapDockerContainer(container.state, container.health),
                detail: container.statusText || null,
                updatedAt: container.createdAt,
              }),
            );
          }
        } catch (error: unknown) {
          void error;
          items.push(
            freezeItem({
              id: dockerCatalogId(integration.id),
              name: integration.name,
              sourceType: "docker",
              integrationId: integration.id,
              status: "down",
              detail: "Indisponible",
              updatedAt: null,
            }),
          );
        }
      }
      return items;
    },
  };
}

function overviewCollector(options: {
  sourceType: ServiceStatusCollector["sourceType"];
  canRead: (actor: IntegrationActor) => boolean;
  list: (
    actor: IntegrationActor,
  ) => Promise<readonly { id: string; name: string; enabled: boolean }[]>;
  collectOne: (
    integrationId: string,
    actor: IntegrationActor,
    name: string,
  ) => Promise<ServiceStatusItem>;
}): ServiceStatusCollector {
  return {
    sourceType: options.sourceType,
    canRead(actor) {
      return options.canRead(asIntegrationActor(actor));
    },
    async listIdentities(actor) {
      const integrations = await options.list(asIntegrationActor(actor));
      return integrations.map((integration) =>
        freezeCatalog({
          id: `${options.sourceType}:${integration.id}`,
          name: integration.name,
          sourceType: options.sourceType,
        }),
      );
    },
    async collect(actor) {
      const integrationActor = asIntegrationActor(actor);
      const integrations = await options.list(integrationActor);
      const items: ServiceStatusItem[] = [];
      for (const integration of integrations) {
        if (!integration.enabled) {
          items.push(
            freezeItem({
              id: `${options.sourceType}:${integration.id}`,
              name: integration.name,
              sourceType: options.sourceType,
              integrationId: integration.id,
              status: "paused",
              detail: "Intégration désactivée",
              updatedAt: null,
            }),
          );
          continue;
        }
        try {
          items.push(await options.collectOne(integration.id, integrationActor, integration.name));
        } catch (error: unknown) {
          void error;
          items.push(
            freezeItem({
              id: `${options.sourceType}:${integration.id}`,
              name: integration.name,
              sourceType: options.sourceType,
              integrationId: integration.id,
              status: "down",
              detail: "Indisponible",
              updatedAt: null,
            }),
          );
        }
      }
      return items;
    },
  };
}

export interface ServiceStatusRuntimeDeps {
  apps: AppService;
  docker: DockerService;
  synology: SynologyService;
  jellyfin: JellyfinService;
  immich: ImmichService;
  beszel: BeszelService;
  prometheus: PrometheusService;
  uptimeKuma: UptimeKumaService;
  proxmox: ProxmoxService;
  grafana: GrafanaService;
  ntfy: NtfyService;
  radarr: RadarrService;
  sonarr: SonarrService;
  coalescer?: ServiceStatusCoalescer;
}

export function createDashboardServiceStatusService(
  deps: ServiceStatusRuntimeDeps,
): ServiceStatusService {
  const collectors: ServiceStatusCollector[] = [
    appCollector(deps.apps),
    dockerCollector(deps.docker),
    overviewCollector({
      sourceType: "synology",
      canRead: (actor) => deps.synology.permissions(actor).canRead,
      list: (actor) => deps.synology.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.synology.getOverview(integrationId, actor);
        return freezeItem({
          id: `synology:${integrationId}`,
          name,
          sourceType: "synology",
          integrationId,
          status: mapOverviewStatus(overview.status),
          detail: overview.status === "degraded" ? "Vue partielle" : null,
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "jellyfin",
      canRead: (actor) => deps.jellyfin.permissions(actor).canRead,
      list: (actor) => deps.jellyfin.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.jellyfin.getOverview(integrationId, actor);
        return freezeItem({
          id: `jellyfin:${integrationId}`,
          name,
          sourceType: "jellyfin",
          integrationId,
          status: mapOverviewStatus(overview.status),
          detail: overview.status === "degraded" ? "Vue partielle" : null,
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "immich",
      canRead: (actor) => deps.immich.permissions(actor).canRead,
      list: (actor) => deps.immich.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.immich.getOverview(integrationId, actor);
        const healthOk = overview.health.data?.ok ?? null;
        return freezeItem({
          id: `immich:${integrationId}`,
          name,
          sourceType: "immich",
          integrationId,
          status: mapImmichHealth({ overviewStatus: overview.status, healthOk }),
          detail:
            healthOk === false
              ? "Santé KO"
              : overview.status === "degraded"
                ? "Vue partielle"
                : null,
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "beszel",
      canRead: (actor) => deps.beszel.permissions(actor).canRead,
      list: (actor) => deps.beszel.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.beszel.getOverview(integrationId, actor);
        const hosts = overview.hosts.data;
        return freezeItem({
          id: `beszel:${integrationId}`,
          name,
          sourceType: "beszel",
          integrationId,
          status: mapBeszelHosts({
            overviewStatus: overview.status,
            hostCount: hosts?.hostCount ?? 0,
            upCount: hosts?.upCount ?? 0,
            downCount: hosts?.downCount ?? 0,
            pausedCount: hosts?.pausedCount ?? 0,
            pendingCount: hosts?.pendingCount ?? 0,
          }),
          detail: hosts ? `${hosts.upCount}/${hosts.hostCount} hôtes` : "Hôtes indisponibles",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "uptime-kuma",
      canRead: (actor) => deps.uptimeKuma.permissions(actor).canRead,
      list: (actor) => deps.uptimeKuma.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.uptimeKuma.getOverview(integrationId, actor);
        const monitors = overview.monitors.data;
        return freezeItem({
          id: `uptime-kuma:${integrationId}`,
          name,
          sourceType: "uptime-kuma",
          integrationId,
          status: mapUptimeKumaMonitors({
            overviewStatus: overview.status,
            monitorCount: monitors?.monitorCount ?? 0,
            upCount: monitors?.upCount ?? 0,
            downCount: monitors?.downCount ?? 0,
            pendingCount: monitors?.pendingCount ?? 0,
            maintenanceCount: monitors?.maintenanceCount ?? 0,
          }),
          detail: monitors
            ? `${monitors.upCount}/${monitors.monitorCount} moniteurs`
            : "Moniteurs indisponibles",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "prometheus",
      canRead: (actor) => deps.prometheus.permissions(actor).canRead,
      list: (actor) => deps.prometheus.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.prometheus.getOverview(integrationId, actor);
        const values = overview.series.map((series) => {
          for (let index = series.points.length - 1; index >= 0; index -= 1) {
            const value = series.points[index]?.value;
            if (typeof value === "number" && Number.isFinite(value)) return value;
          }
          return null;
        });
        return freezeItem({
          id: `prometheus:${integrationId}`,
          name,
          sourceType: "prometheus",
          integrationId,
          status: mapPrometheusUpSeries({ overviewStatus: overview.status, values }),
          detail: overview.seriesCount > 0 ? `${overview.seriesCount} séries` : "Aucune série",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "proxmox",
      canRead: (actor) => deps.proxmox.permissions(actor).canRead,
      list: (actor) => deps.proxmox.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.proxmox.getOverview(integrationId, actor);
        const guests = overview.guests.data;
        return freezeItem({
          id: `proxmox:${integrationId}`,
          name,
          sourceType: "proxmox",
          integrationId,
          status: mapOverviewStatus(overview.status),
          detail: guests
            ? `${guests.vmRunning}/${guests.vmCount} VM · ${guests.lxcRunning}/${guests.lxcCount} CT`
            : "Cluster indisponible",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "grafana",
      canRead: (actor) => deps.grafana.permissions(actor).canRead,
      list: (actor) => deps.grafana.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.grafana.getOverview(integrationId, actor);
        const health = overview.health.data;
        const dashboards = overview.dashboards.data;
        const alerts = overview.alerts.data;
        return freezeItem({
          id: `grafana:${integrationId}`,
          name,
          sourceType: "grafana",
          integrationId,
          status: health?.database === "failing" ? "down" : mapOverviewStatus(overview.status),
          detail: dashboards
            ? `${dashboards.count} tableaux de bord${alerts ? ` · ${alerts.firing} firing` : ""}`
            : "Grafana indisponible",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "ntfy",
      canRead: (actor) => deps.ntfy.permissions(actor).canRead,
      list: (actor) => deps.ntfy.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.ntfy.getOverview(integrationId, actor);
        const health = overview.health.data;
        const stats = overview.stats.data;
        return freezeItem({
          id: `ntfy:${integrationId}`,
          name,
          sourceType: "ntfy",
          integrationId,
          status: health?.healthy === false ? "down" : mapOverviewStatus(overview.status),
          detail: stats ? `${stats.messages} messages` : "ntfy indisponible",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "radarr",
      canRead: (actor) => deps.radarr.permissions(actor).canRead,
      list: (actor) => deps.radarr.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.radarr.getOverview(integrationId, actor);
        const movie = overview.movie.data;
        const health = overview.health.data;
        return freezeItem({
          id: `radarr:${integrationId}`,
          name,
          sourceType: "radarr",
          integrationId,
          status: (health?.error ?? 0) > 0 ? "down" : mapOverviewStatus(overview.status),
          detail: movie
            ? `${movie.count} films${health ? ` · ${health.error} erreurs` : ""}`
            : "Radarr indisponible",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
    overviewCollector({
      sourceType: "sonarr",
      canRead: (actor) => deps.sonarr.permissions(actor).canRead,
      list: (actor) => deps.sonarr.listIntegrations(actor),
      async collectOne(integrationId, actor, name) {
        const overview = await deps.sonarr.getOverview(integrationId, actor);
        const series = overview.series.data;
        const health = overview.health.data;
        return freezeItem({
          id: `sonarr:${integrationId}`,
          name,
          sourceType: "sonarr",
          integrationId,
          status: (health?.error ?? 0) > 0 ? "down" : mapOverviewStatus(overview.status),
          detail: series
            ? `${series.count} séries${health ? ` · ${health.error} erreurs` : ""}`
            : "Sonarr indisponible",
          updatedAt: overview.fetchedAt,
        });
      },
    }),
  ];
  return createServiceStatusService({
    collectors,
    ...(deps.coalescer ? { coalescer: deps.coalescer } : {}),
  });
}

export function requireServiceStatusActor(actor: ServiceStatusActor): void {
  if (!actor.userId) throw new AppError("UNAUTHORIZED", "Authentication required");
}
