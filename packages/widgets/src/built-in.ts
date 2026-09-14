import { appTileContract } from "./app-tile";
import { bookmarksContract } from "./bookmarks";
import { clockContract } from "./clock";
import { beszelHostsContract } from "./beszel-hosts";
import { immichStatsContract } from "./immich-stats";
import { jellyfinSessionsContract } from "./jellyfin-sessions";
import { prometheusMetricContract } from "./prometheus-metric";
import { grafanaStatusContract } from "./grafana-status";
import { proxmoxResourcesContract } from "./proxmox-resources";
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
    .register(jellyfinSessionsContract)
    .register(prometheusMetricContract)
    .register(proxmoxResourcesContract)
    .register(serviceStatusContract)
    .register(uptimeKumaStatusContract)
    .freeze();
}

export const builtInWidgetRegistry = createBuiltInWidgetRegistry();
