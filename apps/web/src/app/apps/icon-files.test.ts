import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_APP_ICON_PATH, builtInAppLibrary } from "@dashboard/app-library";

describe("app library icon files", () => {
  it("ships a local file for every built-in definition", () => {
    const root = resolve(process.cwd(), "public");
    expect(existsSync(resolve(root, "app-icons/generic-app.svg"))).toBe(true);
    for (const definition of builtInAppLibrary.list()) {
      expect(LOCAL_APP_ICON_PATH.test(definition.icon.path)).toBe(true);
      expect(existsSync(resolve(root, definition.icon.path.slice(1)))).toBe(true);
    }
  });
});
