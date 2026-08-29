import type { AppDefinition, AppLibraryView } from "./types";

export function presentAppDefinition(definition: AppDefinition): AppLibraryView {
  const port = definition.defaults?.port;
  const protocol = definition.defaults?.protocol ?? "http";
  const path = definition.defaults?.path ?? "";
  const urlPlaceholder =
    port === undefined ? undefined : `${protocol}://hote:${port}${path === "/" ? "" : path}`;
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    icon: definition.icon,
    tags: definition.tags,
    ...(definition.website ? { website: definition.website } : {}),
    ...(definition.documentation ? { documentation: definition.documentation } : {}),
    ...(definition.defaults || urlPlaceholder
      ? {
          defaults: {
            ...definition.defaults,
            ...(urlPlaceholder ? { urlPlaceholder } : {}),
          },
        }
      : {}),
    ...(definition.health ? { health: definition.health } : {}),
    ...(definition.discovery ? { discovery: definition.discovery } : {}),
    ...(definition.futureIntegrationType
      ? { futureIntegrationType: definition.futureIntegrationType }
      : {}),
  };
}
