import { resolveWidgetConfig } from "./config";
import type { WidgetRegistry } from "./registry";
import type { WidgetCatalogEntry, WidgetEnginePolicy, WidgetSizing } from "./types";

export function createWidgetPolicy(registry: WidgetRegistry): WidgetEnginePolicy {
  return {
    has: (type) => registry.has(type),
    get: (type) => registry.get(type),
    getSizing(type): WidgetSizing | undefined {
      const definition = registry.get(type);
      if (!definition) return undefined;
      return {
        defaultSize: definition.defaultSize,
        minSize: definition.minSize,
        maxSize: definition.maxSize,
      };
    },
    currentVersion: (type) => registry.get(type)?.version,
    resolve: (type, version, config, parseFailed = false) =>
      resolveWidgetConfig(registry.get(type), version, config, parseFailed),
    catalog(): readonly WidgetCatalogEntry[] {
      return registry.list().map((definition) => ({
        id: definition.id,
        version: definition.version,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        defaultSize: definition.defaultSize,
        minSize: definition.minSize,
        maxSize: definition.maxSize,
        publicSafe: definition.publicSafe,
      }));
    },
  };
}
