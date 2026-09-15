import { appTileContract } from "./app-tile";
import { bookmarksContract } from "./bookmarks";
import { clockContract } from "./clock";
import { beszelHostsContract } from "./beszel-hosts";
import { immichStatsContract } from "./immich-stats";
import { jellyfinSessionsContract } from "./jellyfin-sessions";
import { prometheusMetricContract } from "./prometheus-metric";
import { grafanaStatusContract } from "./grafana-status";
import { ntfyStatusContract } from "./ntfy-status";
import { proxmoxResourcesContract } from "./proxmox-resources";
import { prowlarrStatusContract } from "./prowlarr-status";
import { radarrOverviewContract } from "./radarr-overview";
import { sonarrOverviewContract } from "./sonarr-overview";
import { serviceStatusContract } from "./service-status";
import { uptimeKumaStatusContract } from "./uptime-kuma-status";
import { createWidgetRegistry, type WidgetRegistry } from "./registry";

export function createBuiltInWidgetRegistry(): WidgetRegistry {
  return createWidgetRegistry()
    .register(clockContract)
    .register(bookmarksContract)
    .register(appTileContract)
    .register(beszelHostsContract)
    .register(grafanaStatusContract)
    .register(immichStatsContract)
    .register(ntfyStatusContract)
    .register(jellyfinSessionsContract)
    .register(prometheusMetricContract)
    .register(proxmoxResourcesContract)
    .register(prowlarrStatusContract)
    .register(radarrOverviewContract)
    .register(sonarrOverviewContract)
    .register(serviceStatusContract)
    .register(uptimeKumaStatusContract)
    .freeze();
}

export const builtInWidgetRegistry = createBuiltInWidgetRegistry();
