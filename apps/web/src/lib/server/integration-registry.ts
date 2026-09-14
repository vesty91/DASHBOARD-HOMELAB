import { createIntegrationRegistry } from "@dashboard/integrations";
import { beszelIntegrationDefinition } from "@dashboard/beszel";
import { dockerIntegrationDefinition } from "@dashboard/docker";
import { grafanaIntegrationDefinition } from "@dashboard/grafana";
import { immichIntegrationDefinition } from "@dashboard/immich";
import { jellyfinIntegrationDefinition } from "@dashboard/jellyfin";
import { prometheusIntegrationDefinition } from "@dashboard/prometheus";
import { proxmoxIntegrationDefinition } from "@dashboard/proxmox";
import { synologyIntegrationDefinition } from "@dashboard/synology";
import { uptimeKumaIntegrationDefinition } from "@dashboard/uptime-kuma";

export function createApplicationIntegrationRegistry() {
  return createIntegrationRegistry()
    .register(beszelIntegrationDefinition)
    .register(dockerIntegrationDefinition)
    .register(grafanaIntegrationDefinition)
    .register(immichIntegrationDefinition)
    .register(jellyfinIntegrationDefinition)
    .register(prometheusIntegrationDefinition)
    .register(proxmoxIntegrationDefinition)
    .register(synologyIntegrationDefinition)
    .register(uptimeKumaIntegrationDefinition)
    .freeze();
}
