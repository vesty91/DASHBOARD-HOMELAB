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
export type {
  JellyfinPlaybackMode,
  JellyfinSessionViewItem,
  JellyfinSessionsConfig,
  JellyfinSessionsDraftConfig,
  JellyfinSessionsView,
} from "./jellyfin-sessions";
export {
  JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID,
  jellyfinSessionsConfigSchema,
  jellyfinSessionsContract,
  jellyfinSessionsDefaultConfig,
  jellyfinSessionsDraftConfig,
} from "./jellyfin-sessions";

import { builtInWidgetRegistry } from "./built-in";
import { createWidgetPolicy } from "./policy";

export function createBuiltInWidgetPolicy() {
  return createWidgetPolicy(builtInWidgetRegistry);
}
