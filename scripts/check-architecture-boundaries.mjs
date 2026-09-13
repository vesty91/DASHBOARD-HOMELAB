import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const forbiddenDependencies = new Map([
  ["packages/db/package.json", new Set(["@dashboard/web", "@dashboard/widgets"])],
  [
    "packages/integrations/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/synology",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
    ]),
  ],
  [
    "packages/secrets/package.json",
    new Set(["@dashboard/web", "next", "drizzle-orm", "@dashboard/db", "@dashboard/integrations"]),
  ],
  ["packages/apps/package.json", new Set(["@dashboard/web", "next", "drizzle-orm"])],
  [
    "packages/app-library/package.json",
    new Set([
      "@dashboard/web",
      "@dashboard/api",
      "@dashboard/db",
      "@dashboard/integrations",
      "@dashboard/docker",
      "@dashboard/synology",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
      "next",
      "react",
      "drizzle-orm",
    ]),
  ],
  ["packages/monitoring/package.json", new Set(["@dashboard/web", "next"])],
  ["packages/shared/package.json", new Set(["@dashboard/db", "@dashboard/widgets", "next"])],
  [
    "packages/widgets/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "@dashboard/db",
      "@dashboard/boards",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
    ]),
  ],
  [
    "packages/docker/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/synology",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
    ]),
  ],
  [
    "packages/synology/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
    ]),
  ],
  [
    "packages/jellyfin/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/synology",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
    ]),
  ],
  [
    "packages/immich/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/synology",
      "@dashboard/jellyfin",
      "@dashboard/beszel",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
    ]),
  ],
  [
    "packages/beszel/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/synology",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/prometheus",
      "@dashboard/uptime-kuma",
    ]),
  ],
  [
    "packages/uptime-kuma/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/synology",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/prometheus",
    ]),
  ],
  [
    "packages/prometheus/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/synology",
      "@dashboard/jellyfin",
      "@dashboard/immich",
      "@dashboard/beszel",
      "@dashboard/uptime-kuma",
    ]),
  ],
]);

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const violations = [];

for (const [manifestPath, forbidden] of forbiddenDependencies) {
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));

  for (const field of dependencyFields) {
    const dependencies = manifest[field] ?? {};

    for (const dependency of forbidden) {
      if (Object.hasOwn(dependencies, dependency)) {
        violations.push(`${manifest.name}: ${field} must not contain ${dependency}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary violations:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries: valid");
}
