import { builtInAppLibrary } from "./catalog";
import { presentAppDefinition } from "./present";
import type { AppLibraryCategory, AppLibraryView } from "./types";

export {
  APP_LIBRARY_CATEGORIES,
  LOCAL_APP_ICON_PATH,
  type AppDefinition,
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

export function listAppLibrary(): readonly AppLibraryView[] {
  return Object.freeze(builtInAppLibrary.list().map(presentAppDefinition));
}

export function getAppLibraryEntry(id: string): AppLibraryView | undefined {
  const definition = builtInAppLibrary.get(id);
  return definition ? presentAppDefinition(definition) : undefined;
}

export function searchAppLibrary(query: string): readonly AppLibraryView[] {
  return Object.freeze(builtInAppLibrary.search(query).map(presentAppDefinition));
}

export function appLibraryByCategory(category: AppLibraryCategory): readonly AppLibraryView[] {
  return Object.freeze(builtInAppLibrary.byCategory(category).map(presentAppDefinition));
}

export function usedAppLibraryCategories(): readonly AppLibraryCategory[] {
  return Object.freeze(
    [...new Set(builtInAppLibrary.list().map((definition) => definition.category))].sort(),
  );
}
