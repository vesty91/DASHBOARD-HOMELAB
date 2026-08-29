import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
  isActiveDefinition,
  listAppLibrary,
  matchDockerImage,
  normalizeDockerImageRef,
  resolveLifecycleStatus,
} from "./index";
import type { AppDefinition } from "./types";

const ICON_ROOT = resolve(__dirname, "../../../apps/web/public");

function compareOrder(
  left: { lifecycle: { status: string }; category: string; name: string },
  right: { lifecycle: { status: string }; category: string; name: string },
): boolean {
  const rank = { active: 0, legacy: 1, retired: 2 } as const;
  const leftRank = rank[left.lifecycle.status as keyof typeof rank];
  const rightRank = rank[right.lifecycle.status as keyof typeof rank];
  if (leftRank !== rightRank) return leftRank < rightRank;
  const category = left.category.localeCompare(right.category, "und");
  if (category !== 0) return category <= 0;
  return left.name.localeCompare(right.name, "und") <= 0;
}
const REQUIRED_CATEGORIES = [
  "media",
  "downloads",
  "automation",
  "monitoring",
  "infrastructure",
  "network",
  "storage",
  "security",
  "home-automation",
  "productivity",
  "development",
] as const;

const sample: AppDefinition = {
  id: "sample-app",
  name: "Sample",
  description: "A sample definition for registry tests.",
  category: "other",
  icon: { path: "/app-icons/sample-app.svg", source: "internal" },
  tags: ["demo", "test"],
};

describe("built-in app library", () => {
  it("registers at least 85 unique deterministic definitions", () => {
    const first = builtInAppLibrary.list();
    const second = createBuiltInAppLibrary().list();
    expect(first.length).toBeGreaterThanOrEqual(85);
    expect(first.length).toBeLessThanOrEqual(100);
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
      if (definition.documentation) expect(definition.documentation.startsWith("http")).toBe(true);
      for (const image of definition.discovery?.dockerImages ?? []) {
        expect(image.includes("/")).toBe(true);
        expect(image.includes(":")).toBe(false);
        expect(image.includes("*")).toBe(false);
      }
      const iconFile = resolve(ICON_ROOT, definition.icon.path.replace(/^\//, ""));
      expect(existsSync(iconFile), `${definition.id} icon missing at ${iconFile}`).toBe(true);
    }
    for (const category of REQUIRED_CATEGORIES) {
      expect(builtInAppLibrary.byCategory(category).length).toBeGreaterThan(0);
    }
  });

  it("exposes a valid lifecycle and replacement graph", () => {
    const views = listAppLibrary();
    expect(
      views.every((item, index, all) => {
        if (index === 0) return true;
        const previous = all[index - 1];
        return previous !== undefined && compareOrder(previous, item);
      }),
    ).toBe(true);
    for (const definition of builtInAppLibrary.list()) {
      const status = resolveLifecycleStatus(definition);
      if (status === "active") expect(definition.lifecycle?.replacedBy).toBeUndefined();
      const replacedBy = definition.lifecycle?.replacedBy;
      if (!replacedBy) continue;
      expect(replacedBy).not.toBe(definition.id);
      const target = builtInAppLibrary.get(replacedBy);
      expect(target, `${definition.id} replacedBy ${replacedBy}`).toBeDefined();
      expect(resolveLifecycleStatus(target!)).toBe("active");
    }
    const seerr = builtInAppLibrary.get("seerr");
    const jellyseerr = builtInAppLibrary.get("jellyseerr");
    const overseerr = builtInAppLibrary.get("overseerr");
    const readarr = builtInAppLibrary.get("readarr");
    const portainer = builtInAppLibrary.get("portainer");
    const unifi = builtInAppLibrary.get("unifi");
    expect(resolveLifecycleStatus(seerr!)).toBe("active");
    expect(jellyseerr?.lifecycle).toMatchObject({ status: "legacy", replacedBy: "seerr" });
    expect(overseerr?.lifecycle).toMatchObject({ status: "legacy", replacedBy: "seerr" });
    expect(readarr?.lifecycle?.status).toBe("retired");
    expect(readarr?.lifecycle?.replacedBy).toBeUndefined();
    expect(portainer?.defaults).toMatchObject({ protocol: "https", port: 9443 });
    expect(unifi?.name).toBe("UniFi Network Application");
    expect(unifi?.discovery?.dockerImages?.[0]).toBe("linuxserver/unifi-network-application");
    expect(unifi?.discovery?.dockerImages).toContain("linuxserver/unifi-controller");
    expect(
      views.filter((item) => item.lifecycle.status === "active").every(isActiveDefinition),
    ).toBe(true);
    expect(views.find((item) => item.id === "readarr")?.lifecycle.status).toBe("retired");
    expect(views.find((item) => item.id === "jellyseerr")?.lifecycle.replacedByName).toBe("Seerr");
    for (const id of [
      "homepage",
      "homarr",
      "tdarr",
      "tube-archivist",
      "speedtest-tracker",
      "wg-easy",
      "linkwarden",
    ]) {
      expect(builtInAppLibrary.get(id)?.icon).toEqual({
        path: "/app-icons/generic-app.svg",
        source: "internal",
      });
    }
  });

  it("keeps active apps first and finds legacy replacements", () => {
    const seerrSearch = builtInAppLibrary.search("seerr");
    expect(seerrSearch[0]?.id).toBe("seerr");
    expect(seerrSearch.map((item) => item.id)).toEqual(
      expect.arrayContaining(["seerr", "jellyseerr"]),
    );
    const overseerrSearch = builtInAppLibrary.search("overseerr");
    expect(overseerrSearch.map((item) => item.id)).toEqual(expect.arrayContaining(["overseerr"]));
    const activeIds = builtInAppLibrary
      .list()
      .filter((item) => resolveLifecycleStatus(item) === "active")
      .map((item) => item.id);
    expect(activeIds).toContain("seerr");
    expect(activeIds).not.toContain("readarr");
    expect(activeIds).not.toContain("jellyseerr");
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
    expect(() =>
      appDefinitionSchema.parse({
        ...sample,
        lifecycle: { status: "active", replacedBy: "other-app" },
      }),
    ).toThrow();
    expect(() =>
      appDefinitionSchema.parse({
        ...sample,
        lifecycle: { status: "legacy", replacedBy: "sample-app" },
      }),
    ).toThrow();
    expect(() =>
      appDefinitionSchema.parse({
        ...sample,
        discovery: { dockerImages: ["seerr:latest"] },
      }),
    ).toThrow();
  });

  it("rejects missing, cyclic or inactive replacements at freeze", () => {
    const missing = createAppLibraryRegistry().register({
      ...sample,
      id: "old-app",
      lifecycle: { status: "legacy", replacedBy: "missing-app" },
    });
    expect(() => missing.freeze()).toThrow(/does not exist/);

    const inactive = createAppLibraryRegistry()
      .register({
        ...sample,
        id: "retired-target",
        lifecycle: { status: "retired" },
      })
      .register({
        ...sample,
        id: "legacy-app",
        lifecycle: { status: "legacy", replacedBy: "retired-target" },
      });
    expect(() => inactive.freeze()).toThrow(/must be active/);

    const cyclic = createAppLibraryRegistry()
      .register({
        ...sample,
        id: "alpha-app",
        lifecycle: { status: "legacy", replacedBy: "beta-app" },
      })
      .register({
        ...sample,
        id: "beta-app",
        lifecycle: { status: "legacy", replacedBy: "alpha-app" },
      });
    expect(() => cyclic.freeze()).toThrow(/cycle/i);
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

  it("matches new curated images without wildcards", () => {
    const seerr = builtInAppLibrary.get("seerr");
    const homepage = builtInAppLibrary.get("homepage");
    const dockge = builtInAppLibrary.get("dockge");
    const n8n = builtInAppLibrary.get("n8n");
    const syncthing = builtInAppLibrary.get("syncthing");
    const scrutiny = builtInAppLibrary.get("scrutiny");
    const tautulli = builtInAppLibrary.get("tautulli");
    const wgEasy = builtInAppLibrary.get("wg-easy");
    expect(
      matchDockerImage("ghcr.io/seerr-team/seerr:latest", seerr?.discovery?.dockerImages),
    ).toBe(true);
    expect(
      matchDockerImage("ghcr.io/gethomepage/homepage:v1", homepage?.discovery?.dockerImages),
    ).toBe(true);
    expect(matchDockerImage("louislam/dockge:1", dockge?.discovery?.dockerImages)).toBe(true);
    expect(matchDockerImage("docker.n8n.io/n8nio/n8n:1", n8n?.discovery?.dockerImages)).toBe(true);
    expect(matchDockerImage("syncthing/syncthing:2", syncthing?.discovery?.dockerImages)).toBe(
      true,
    );
    expect(
      matchDockerImage(
        "ghcr.io/analogj/scrutiny:latest-omnibus",
        scrutiny?.discovery?.dockerImages,
      ),
    ).toBe(true);
    expect(matchDockerImage("tautulli/tautulli:latest", tautulli?.discovery?.dockerImages)).toBe(
      true,
    );
    expect(matchDockerImage("ghcr.io/wg-easy/wg-easy:15", wgEasy?.discovery?.dockerImages)).toBe(
      true,
    );
    expect(matchDockerImage("my-seerr-malware", seerr?.discovery?.dockerImages)).toBe(false);
    expect(matchDockerImage("evil/n8n", n8n?.discovery?.dockerImages)).toBe(false);
    expect(
      findDefinitionsForDockerImage("fallenbagel/jellyseerr:2", builtInAppLibrary.list()).map(
        (item) => item.id,
      ),
    ).toEqual(["jellyseerr"]);
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
