export type { AppTileConfig, AppTileData, AppTileDraftConfig, AppTileView } from "./app-tile";
export {
  APP_TILE_UNSET_APP_ID,
  appTileConfigSchema,
  appTileContract,
  appTileDefaultConfig,
  appTileDraftConfig,
} from "./app-tile";
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
