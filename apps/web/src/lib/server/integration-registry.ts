import { createIntegrationRegistry } from "@dashboard/integrations";
import { dockerIntegrationDefinition } from "@dashboard/docker";
import { jellyfinIntegrationDefinition } from "@dashboard/jellyfin";
import { synologyIntegrationDefinition } from "@dashboard/synology";

export function createApplicationIntegrationRegistry() {
  return createIntegrationRegistry()
    .register(dockerIntegrationDefinition)
    .register(synologyIntegrationDefinition)
    .register(jellyfinIntegrationDefinition)
    .freeze();
}
