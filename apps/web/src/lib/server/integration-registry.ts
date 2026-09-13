import { createIntegrationRegistry } from "@dashboard/integrations";
import { beszelIntegrationDefinition } from "@dashboard/beszel";
import { dockerIntegrationDefinition } from "@dashboard/docker";
import { immichIntegrationDefinition } from "@dashboard/immich";
import { jellyfinIntegrationDefinition } from "@dashboard/jellyfin";
import { synologyIntegrationDefinition } from "@dashboard/synology";
import { uptimeKumaIntegrationDefinition } from "@dashboard/uptime-kuma";

export function createApplicationIntegrationRegistry() {
  return createIntegrationRegistry()
    .register(beszelIntegrationDefinition)
    .register(dockerIntegrationDefinition)
    .register(immichIntegrationDefinition)
    .register(jellyfinIntegrationDefinition)
    .register(synologyIntegrationDefinition)
    .register(uptimeKumaIntegrationDefinition)
    .freeze();
}
