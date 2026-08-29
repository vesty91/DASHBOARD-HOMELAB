import { builtInAppLibrary } from "./catalog";
import { presentAppDefinition } from "./present";
import type { AppDefinition, AppLibraryCategory, AppLibraryView } from "./types";

export {
  APP_LIBRARY_CATEGORIES,
  APP_LIFECYCLE_STATUSES,
  LOCAL_APP_ICON_PATH,
  type AppDefinition,
  type AppLifecycle,
  type AppLifecycleStatus,
  type AppLibraryCategory,
  type AppLibraryView,
} from "./types";
export { appDefinitionSchema } from "./schema";
export { AppLibraryRegistry, createAppLibraryRegistry } from "./registry";
export { createBuiltInAppLibrary, builtInAppLibrary } from "./catalog";
export {
  findDefinitionsForDockerImage,
  matchDockerImage,
  normalizeDockerImageRef,
} from "./match-docker";
export { presentAppDefinition } from "./present";
export {
  compareAppDefinitions,
  isActiveDefinition,
  resolveLifecycleStatus,
  validateReplacementGraph,
} from "./lifecycle";

function presentBuiltIn(definition: AppDefinition): AppLibraryView {
  return presentAppDefinition(definition, (id) => builtInAppLibrary.get(id));
}

export function listAppLibrary(): readonly AppLibraryView[] {
  return Object.freeze(builtInAppLibrary.list().map(presentBuiltIn));
}

export function getAppLibraryEntry(id: string): AppLibraryView | undefined {
  const definition = builtInAppLibrary.get(id);
  return definition ? presentBuiltIn(definition) : undefined;
}

export function searchAppLibrary(query: string): readonly AppLibraryView[] {
  return Object.freeze(builtInAppLibrary.search(query).map(presentBuiltIn));
}

export function appLibraryByCategory(category: AppLibraryCategory): readonly AppLibraryView[] {
  return Object.freeze(builtInAppLibrary.byCategory(category).map(presentBuiltIn));
}

export function usedAppLibraryCategories(): readonly AppLibraryCategory[] {
  return Object.freeze(
    [...new Set(builtInAppLibrary.list().map((definition) => definition.category))].sort(),
  );
}
