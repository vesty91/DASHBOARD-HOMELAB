import { appTileContract } from "./app-tile";
import { bookmarksContract } from "./bookmarks";
import { clockContract } from "./clock";
import { beszelHostsContract } from "./beszel-hosts";
import { immichStatsContract } from "./immich-stats";
import { jellyfinSessionsContract } from "./jellyfin-sessions";
import { createWidgetRegistry, type WidgetRegistry } from "./registry";

export function createBuiltInWidgetRegistry(): WidgetRegistry {
  return createWidgetRegistry()
    .register(clockContract)
    .register(bookmarksContract)
    .register(appTileContract)
    .register(beszelHostsContract)
    .register(immichStatsContract)
    .register(jellyfinSessionsContract)
    .freeze();
}

export const builtInWidgetRegistry = createBuiltInWidgetRegistry();
