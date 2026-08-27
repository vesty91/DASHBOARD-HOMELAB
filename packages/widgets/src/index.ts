export type { AppTileConfig, AppTileData, AppTileView } from "./app-tile";
export { appTileConfigSchema, appTileContract, appTileDefaultConfig } from "./app-tile";
export type { BookmarkLink, BookmarksConfig } from "./bookmarks";
export {
  bookmarkLinkSchema,
  bookmarksConfigSchema,
  bookmarksContract,
  bookmarksDefaultConfig,
} from "./bookmarks";
export { builtInWidgetRegistry, createBuiltInWidgetRegistry } from "./built-in";
export type { ClockConfig } from "./clock";
export {
  clockConfigSchema,
  clockContract,
  clockDefaultConfig,
  formatClock,
  isValidTimeZone,
} from "./clock";
export { resolveWidgetConfig, serializeWidgetConfig, statusToRuntime } from "./config";
export { assertWidgetContract } from "./definition";
export { createWidgetPolicy } from "./policy";
export { createWidgetRegistry, WidgetRegistry } from "./registry";
export type {
  WidgetCatalogEntry,
  WidgetConfigMigration,
  WidgetContract,
  WidgetEnginePolicy,
  WidgetItemStatus,
  WidgetResolveResult,
  WidgetRuntimeState,
  WidgetSize,
  WidgetSizing,
} from "./types";
export { parseHttpUrl } from "./urls";

import { builtInWidgetRegistry } from "./built-in";
import { createWidgetPolicy } from "./policy";

export function createBuiltInWidgetPolicy() {
  return createWidgetPolicy(builtInWidgetRegistry);
}
