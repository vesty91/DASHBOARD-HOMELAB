import { createIntegrationRegistry } from "@dashboard/integrations";
import { dockerIntegrationDefinition } from "@dashboard/docker";

export function createApplicationIntegrationRegistry() {
  return createIntegrationRegistry().register(dockerIntegrationDefinition).freeze();
}
