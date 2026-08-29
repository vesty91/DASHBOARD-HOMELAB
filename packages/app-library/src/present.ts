import { resolveLifecycleStatus } from "./lifecycle";
import type { AppDefinition, AppLibraryView } from "./types";

export function presentAppDefinition(
  definition: AppDefinition,
  lookup?: (id: string) => AppDefinition | undefined,
): AppLibraryView {
  const port = definition.defaults?.port;
  const protocol = definition.defaults?.protocol ?? "http";
  const path = definition.defaults?.path ?? "";
  const urlPlaceholder =
    port === undefined ? undefined : `${protocol}://hote:${port}${path === "/" ? "" : path}`;
  const replacedBy = definition.lifecycle?.replacedBy;
  const replacedByName = replacedBy ? lookup?.(replacedBy)?.name : undefined;
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
    lifecycle: {
      status: resolveLifecycleStatus(definition),
      ...(replacedBy ? { replacedBy } : {}),
      ...(replacedByName ? { replacedByName } : {}),
      ...(definition.lifecycle?.note ? { note: definition.lifecycle.note } : {}),
    },
  };
}
