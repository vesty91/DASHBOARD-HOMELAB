import { appTileContract } from "./app-tile";
import { bookmarksContract } from "./bookmarks";
import { clockContract } from "./clock";
import { createWidgetRegistry, type WidgetRegistry } from "./registry";

export function createBuiltInWidgetRegistry(): WidgetRegistry {
  return createWidgetRegistry()
    .register(clockContract)
    .register(bookmarksContract)
    .register(appTileContract)
    .freeze();
}

export const builtInWidgetRegistry = createBuiltInWidgetRegistry();
