import { describe, expect, it } from "vitest";
import { z } from "zod";
import { appTileContract } from "./app-tile";
import { bookmarksContract } from "./bookmarks";
import { createBuiltInWidgetRegistry } from "./built-in";
import { clockContract } from "./clock";
import { createWidgetRegistry } from "./registry";
import type { WidgetContract } from "./types";

const valid = (overrides: Partial<WidgetContract> = {}): WidgetContract => ({
  id: "sample",
  version: 1,
  name: "Sample",
  description: "Sample widget",
  category: "test",
  defaultSize: { w: 2, h: 2 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  defaultConfig: { label: "ok" },
  configSchema: z.object({ label: z.string() }),
  publicSafe: true,
  ...overrides,
});

describe("widget registry", () => {
  it("registers, lists deterministically and looks up by id", () => {
    const registry = createWidgetRegistry()
      .register(valid({ id: "zeta" }))
      .register(valid({ id: "alpha", name: "Alpha" }));
    expect(registry.list().map((entry) => entry.id)).toEqual(["alpha", "zeta"]);
    expect(registry.get("alpha")?.name).toBe("Alpha");
    expect(registry.has("missing")).toBe(false);
    expect(registry.get("missing")).toBeUndefined();
  });

  it("rejects duplicate ids", () => {
    const registry = createWidgetRegistry().register(valid());
    expect(() => registry.register(valid())).toThrow(/Duplicate widget id/);
  });

  it("rejects invalid definitions and default configs", () => {
    expect(() => createWidgetRegistry().register(valid({ id: "Invalid ID" }))).toThrow(
      /stable lowercase slug/,
    );
    expect(() => createWidgetRegistry().register(valid({ version: 0 }))).toThrow(/version/);
    expect(() =>
      createWidgetRegistry().register(
        valid({ minSize: { w: 3, h: 1 }, defaultSize: { w: 2, h: 2 } }),
      ),
    ).toThrow(/min.w/);
    expect(() =>
      createWidgetRegistry().register(
        valid({ defaultConfig: { label: 1 } as unknown as { label: string } }),
      ),
    ).toThrow(/defaultConfig/);
  });

  it("freezes the built-in registry", () => {
    const registry = createBuiltInWidgetRegistry();
    expect(registry.list().map((entry) => entry.id)).toEqual(["app-tile", "bookmarks", "clock"]);
    expect(registry.get("clock")).toMatchObject({ version: 1, publicSafe: true });
    expect(registry.get("bookmarks")?.publicSafe).toBe(false);
    expect(registry.get("app-tile")?.publicSafe).toBe(false);
    expect(() => registry.register(clockContract)).toThrow(/immutable/);
  });

  it("exposes built-in contracts at version 1", () => {
    expect(clockContract).toMatchObject({ id: "clock", version: 1, publicSafe: true });
    expect(bookmarksContract).toMatchObject({ id: "bookmarks", version: 1, publicSafe: false });
    expect(appTileContract).toMatchObject({ id: "app-tile", version: 1, publicSafe: false });
  });
});
