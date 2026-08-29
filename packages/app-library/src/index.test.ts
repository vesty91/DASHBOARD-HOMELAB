import { describe, expect, it } from "vitest";
import {
  APP_LIBRARY_CATEGORIES,
  AppLibraryRegistry,
  LOCAL_APP_ICON_PATH,
  appDefinitionSchema,
  builtInAppLibrary,
  createAppLibraryRegistry,
  createBuiltInAppLibrary,
  findDefinitionsForDockerImage,
  listAppLibrary,
  matchDockerImage,
  normalizeDockerImageRef,
} from "./index";
import type { AppDefinition } from "./types";

const sample: AppDefinition = {
  id: "sample-app",
  name: "Sample",
  description: "A sample definition for registry tests.",
  category: "other",
  icon: { path: "/app-icons/sample-app.svg", source: "internal" },
  tags: ["demo", "test"],
};

describe("built-in app library", () => {
  it("registers at least 50 unique deterministic definitions", () => {
    const first = builtInAppLibrary.list();
    const second = createBuiltInAppLibrary().list();
    expect(first.length).toBeGreaterThanOrEqual(50);
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(listAppLibrary()).toHaveLength(first.length);
  });

  it("uses valid categories, tags and local icon paths", () => {
    for (const definition of builtInAppLibrary.list()) {
      expect(APP_LIBRARY_CATEGORIES).toContain(definition.category);
      expect(LOCAL_APP_ICON_PATH.test(definition.icon.path)).toBe(true);
      expect(new Set(definition.tags).size).toBe(definition.tags.length);
      expect(definition.tags.length).toBeGreaterThanOrEqual(1);
      expect(definition.tags.length).toBeLessThanOrEqual(8);
      if (definition.defaults?.port !== undefined) {
        expect(definition.defaults.port).toBeGreaterThanOrEqual(1);
        expect(definition.defaults.port).toBeLessThanOrEqual(65535);
      }
      if (definition.website) expect(definition.website.startsWith("http")).toBe(true);
    }
  });

  it("searches and filters by category", () => {
    const jelly = builtInAppLibrary.search("jelly");
    expect(jelly.map((item) => item.id)).toEqual(
      expect.arrayContaining(["jellyfin", "jellyseerr"]),
    );
    expect(
      builtInAppLibrary.byCategory("monitoring").every((item) => item.category === "monitoring"),
    ).toBe(true);
    expect(builtInAppLibrary.search("   ").map((item) => item.id)).toEqual(
      builtInAppLibrary.list().map((item) => item.id),
    );
  });

  it("rejects duplicate ids and invalid definitions", () => {
    const registry = createAppLibraryRegistry().register(sample);
    expect(() => registry.register(sample)).toThrow(/Duplicate/);
    expect(() => appDefinitionSchema.parse({ ...sample, id: "Not Slug", tags: ["ok"] })).toThrow();
    expect(() => appDefinitionSchema.parse({ ...sample, tags: ["demo", "DEMO"] })).toThrow();
    expect(() =>
      appDefinitionSchema.parse({
        ...sample,
        icon: { path: "/other/test.svg", source: "internal" },
      }),
    ).toThrow();
    expect(() =>
      appDefinitionSchema.parse({ ...sample, website: "javascript:alert(1)" }),
    ).toThrow();
    expect(() => appDefinitionSchema.parse({ ...sample, defaults: { port: 0 } })).toThrow();
  });

  it("freezes definitions after register", () => {
    const registry = new AppLibraryRegistry().register(sample);
    const stored = registry.get("sample-app");
    expect(stored).toBeDefined();
    expect(() => {
      (stored as { name: string }).name = "mutated";
    }).toThrow();
    registry.freeze();
    expect(() => registry.register({ ...sample, id: "other-app" })).toThrow(/immutable/);
  });
});

describe("docker image matcher", () => {
  const jellyfin = builtInAppLibrary.get("jellyfin");
  const immich = builtInAppLibrary.get("immich");

  it("canonicalizes official Docker Hub image refs", () => {
    expect(normalizeDockerImageRef("traefik:latest")).toBe("library/traefik");
    expect(normalizeDockerImageRef("nextcloud")).toBe("library/nextcloud");
    expect(normalizeDockerImageRef("postgres:18")).toBe("library/postgres");
    expect(
      normalizeDockerImageRef(
        "nextcloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe("library/nextcloud");
    expect(normalizeDockerImageRef("linuxserver/jellyfin:latest")).toBe("linuxserver/jellyfin");
    expect(normalizeDockerImageRef("ghcr.io/immich-app/immich-server:v1")).toBe(
      "ghcr.io/immich-app/immich-server",
    );
    expect(matchDockerImage("traefik:latest", ["library/traefik"])).toBe(true);
    expect(matchDockerImage("nextcloud:latest", ["library/nextcloud"])).toBe(true);
  });

  it("matches tagged and digested official images", () => {
    expect(matchDockerImage("jellyfin/jellyfin:10.10.0", jellyfin?.discovery?.dockerImages)).toBe(
      true,
    );
    expect(
      matchDockerImage(
        "ghcr.io/immich-app/immich-server:v1.130.0@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        immich?.discovery?.dockerImages,
      ),
    ).toBe(true);
    expect(
      matchDockerImage("lscr.io/linuxserver/jellyfin:latest", jellyfin?.discovery?.dockerImages),
    ).toBe(true);
    expect(
      findDefinitionsForDockerImage(
        "ghcr.io/immich-app/immich-server:v1.130.0",
        builtInAppLibrary.list(),
      ).map((item) => item.id),
    ).toEqual(["immich"]);
  });

  it("does not match overly broad names", () => {
    expect(matchDockerImage("my-jellyfin-malware", jellyfin?.discovery?.dockerImages)).toBe(false);
    expect(
      matchDockerImage("linuxserver/jellyfin-malware", jellyfin?.discovery?.dockerImages),
    ).toBe(false);
    expect(matchDockerImage("evil/not-jellyfin", jellyfin?.discovery?.dockerImages)).toBe(false);
    expect(matchDockerImage("../secret", ["jellyfin/jellyfin"])).toBe(false);
    expect(matchDockerImage("my-traefik-malware", ["library/traefik"])).toBe(false);
    expect(matchDockerImage("evil/nextcloud", ["library/nextcloud"])).toBe(false);
  });
});
