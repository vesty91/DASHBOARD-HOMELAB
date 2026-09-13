import { createIntegrationRegistry } from "@dashboard/integrations";
import { dockerIntegrationDefinition } from "@dashboard/docker";
import { immichIntegrationDefinition } from "@dashboard/immich";
import { jellyfinIntegrationDefinition } from "@dashboard/jellyfin";
import { synologyIntegrationDefinition } from "@dashboard/synology";

export function createApplicationIntegrationRegistry() {
  return createIntegrationRegistry()
    .register(dockerIntegrationDefinition)
    .register(immichIntegrationDefinition)
    .register(jellyfinIntegrationDefinition)
    .register(synologyIntegrationDefinition)
    .freeze();
}
