import { createIntegrationRegistry } from "@dashboard/integrations";
import { dockerIntegrationDefinition } from "@dashboard/docker";
import { synologyIntegrationDefinition } from "@dashboard/synology";

export function createApplicationIntegrationRegistry() {
  return createIntegrationRegistry()
    .register(dockerIntegrationDefinition)
    .register(synologyIntegrationDefinition)
    .freeze();
}
